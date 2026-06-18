import { Effect, Layer, Cause } from "effect"
import { join } from "node:path"
import type { ProwlarrResult } from "@inkpipe/shared"
import { PipelineError } from "@inkpipe/shared"
import { JobStoreService } from "./JobStore"
import { AllDebridService } from "./AllDebrid"
import { KccService } from "./Kcc"
import { CopypartyService } from "./Copyparty"
import { FileManagerService } from "./FileManager"
import { ConfigService } from "./Config"
import { LogService } from "./Log"

export class PipelineService extends Effect.Tag("PipelineService")<
  PipelineService,
  {
    readonly runPipeline: (result: ProwlarrResult, subfolder?: string, createdFolder?: boolean) => Effect.Effect<void, PipelineError>
  }
>() {}

const POLL_INTERVAL = 3000

const sleep = (ms: number) =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))

export const PipelineServiceLive = Layer.effect(
  PipelineService,
  Effect.gen(function* () {
    const jobStore = yield* JobStoreService
    const alldebrid = yield* AllDebridService
    const kcc = yield* KccService
    const copyparty = yield* CopypartyService
    const fileManager = yield* FileManagerService
    const configService = yield* ConfigService
    const log = yield* LogService

    const runPipeline = (result: ProwlarrResult, subfolder?: string, createdFolder?: boolean) =>
      Effect.gen(function* () {
        yield* log.info("pipeline", "Starting pipeline for:", result.title)
        yield* log.info("pipeline", "magnetUrl:", result.magnetUrl)
        yield* log.info("pipeline", "downloadUrl:", result.downloadUrl)

        const magnetOrUrl = result.magnetUrl ?? result.downloadUrl
        if (!magnetOrUrl) {
          yield* log.error("pipeline", "No magnet or download URL for:", result.title)
          return yield* Effect.fail(
            new PipelineError({ message: `No magnet or download URL for "${result.title}"` }),
          )
        }

        const job = yield* jobStore.createJob(result.title)
        const jl = log.withJob(job.id)
        yield* jl.info("jobs", "Created job")

        let magnetId: number | null = null

        const pipelineBody = Effect.gen(function* () {
          // Stage 1: Upload
          yield* jl.info("pipeline", "Stage: UPLOADING")
          yield* jobStore.updateJob(job.id, { stage: "UPLOADING", progress: 50 })
          const upload = yield* alldebrid.uploadMagnet(magnetOrUrl)
          magnetId = upload.id
          yield* jl.info("pipeline", "Magnet uploaded, id:", upload.id, "ready:", upload.ready)

          // Stage 2: Wait for ready
          if (!upload.ready) {
            yield* jl.info("pipeline", "Stage: DEBRID_PROCESSING")
            yield* jobStore.updateJob(job.id, { stage: "DEBRID_PROCESSING", progress: 50 })
            let pollCount = 0
            while (true) {
              pollCount++
              const status = yield* alldebrid.getMagnetStatus(upload.id)
              if (status.status === "Ready") {
                yield* jl.info("pipeline", "Debrid ready after", pollCount, "polls")
                break
              }
              if (status.statusCode >= 5) {
                return yield* Effect.fail(
                  new PipelineError({
                    message: `AllDebrid magnet error: ${status.status} (code ${status.statusCode})`,
                  }),
                )
              }
              yield* jl.info("pipeline", "Debrid not ready (poll #" + pollCount + ", status: " + status.status + "), waiting...")
              yield* sleep(POLL_INTERVAL)
            }
          } else {
            yield* jl.info("pipeline", "Already ready at upload, skipping poll")
          }

          // Stage 2b: Get files
          const debridFiles = yield* alldebrid.getMagnetFiles(upload.id)
          yield* jl.info("pipeline", "Got", debridFiles.length, "files from AllDebrid")
          if (debridFiles.length === 0) {
            return yield* Effect.fail(
              new PipelineError({ message: "No files returned from AllDebrid" }),
            )
          }

          // Stage 3: Download
          yield* jl.info("pipeline", "Stage: DOWNLOADING (" + debridFiles.length + " files)")
          yield* jobStore.updateJob(job.id, { stage: "DOWNLOADING" })
          const jobDir = yield* fileManager.ensureJobDir(job.id)
          yield* jl.info("pipeline", "Job dir:", jobDir)

          for (let i = 0; i < debridFiles.length; i++) {
            const file = debridFiles[i]
            yield* jl.info("pipeline", "Unlocking file " + (i + 1) + "/" + debridFiles.length + ":", file.filename)
            const unlocked = yield* alldebrid.unlockLink(file.link)
            const destPath = join(jobDir, unlocked.filename)
            yield* jl.info("pipeline", "Downloading to:", destPath, "(" + unlocked.size + " bytes)")
            yield* alldebrid.downloadFile(unlocked.url, destPath, (received, total) => {
              if (total > 0) {
                Effect.runFork(
                  jobStore.updateJob(job.id, {
                    progress: Math.round(((i + received / total) / debridFiles.length) * 100),
                  }),
                )
              }
            })
          }

          // Stage 4: Convert
          const epubFile = yield* fileManager.findFileByExtension(jobDir, [".epub"])
          if (!epubFile) {
            yield* jl.info("pipeline", "Stage: CONVERTING")
            yield* jobStore.updateJob(job.id, { stage: "CONVERTING" })
            const comicFiles = yield* fileManager.findAllFilesByExtension(jobDir, [
              ".cbz", ".cbr", ".zip", ".rar", ".pdf",
            ])
            if (comicFiles.length > 0) {
              for (let i = 0; i < comicFiles.length; i++) {
                const file = comicFiles[i]
                let kccInput = file
                if (file.toLowerCase().endsWith(".cbr") || file.toLowerCase().endsWith(".rar")) {
                  yield* jl.info("pipeline", "Extracting RAR archive:", file)
                  kccInput = yield* fileManager.extractRarArchive(file)
                }
                yield* jl.info("pipeline", "Converting:", kccInput)
                yield* kcc.convert(kccInput, jobDir)
                yield* jobStore.updateJob(job.id, {
                  progress: Math.round(((i + 1) / comicFiles.length) * 100),
                })
              }
              yield* jl.info("pipeline", "Conversion complete (" + comicFiles.length + " file(s))")
            } else {
              yield* jl.info("pipeline", "No convertible file found, skipping conversion")
            }
          } else {
            yield* jl.info("pipeline", "Already an EPUB, skipping conversion:", epubFile)
          }

          // Stage 5: Copyparty upload
          const config = yield* configService.loadConfig
          if (config.copyparty.url) {
            yield* jl.info("pipeline", "Stage: UPLOADING_COPYPARTY")
            yield* jobStore.updateJob(job.id, { stage: "UPLOADING_COPYPARTY" })

            let filesToUpload = yield* fileManager.findAllFilesByExtension(jobDir, [".epub"])
            if (filesToUpload.length === 0) {
              filesToUpload = yield* fileManager.findAllFilesByExtension(jobDir, [".cbz", ".cbr"])
            }
            if (filesToUpload.length === 0) {
              filesToUpload = yield* fileManager.findAllFilesByExtension(jobDir, [".zip", ".rar", ".pdf"])
            }

            if (filesToUpload.length > 0) {
              for (let i = 0; i < filesToUpload.length; i++) {
                const file = filesToUpload[i]
                yield* jl.info("pipeline", "Uploading to Copyparty:", file)
                yield* copyparty.uploadFile(file, subfolder)
                yield* jobStore.updateJob(job.id, {
                  progress: Math.round(((i + 1) / filesToUpload.length) * 100),
                })
              }
              yield* jl.info("pipeline", "Copyparty upload complete (" + filesToUpload.length + " file(s))")
            } else {
              yield* jl.info("pipeline", "No file found to upload to Copyparty")
            }
          } else {
            yield* jl.info("pipeline", "Copyparty not configured, skipping upload")
          }

          // Done
          yield* jl.info("pipeline", "Stage: DONE")
          yield* jobStore.updateJob(job.id, { stage: "DONE" })
        })

        const cleanup = Effect.gen(function* () {
          yield* jl.info("pipeline", "Cleaning up")
          yield* Effect.catchAll(
            fileManager.cleanupJobDir(job.id),
            () => Effect.void,
          )
          if (magnetId !== null) {
            yield* Effect.catchAll(
              alldebrid.deleteMagnet(magnetId),
              () => Effect.void,
            )
          }
        })

        yield* pipelineBody.pipe(
          Effect.catchAllCause((cause) => {
            const e = Cause.squash(cause)
            const message = e instanceof Error ? e.message : String(e)
            return Effect.gen(function* () {
              yield* jl.error("pipeline", "FAILED:", message)
              if (e instanceof Error && e.stack) {
                yield* jl.error("pipeline", "Stack:", e.stack)
              }
              yield* jobStore.updateJob(job.id, { stage: "FAILED", error: message })
              if (createdFolder && subfolder) {
                yield* Effect.catchAll(
                  copyparty.deleteFolder(subfolder),
                  () => Effect.void,
                )
              }
            })
          }),
          Effect.ensuring(cleanup),
        )
      })

    return { runPipeline }
  }),
)
