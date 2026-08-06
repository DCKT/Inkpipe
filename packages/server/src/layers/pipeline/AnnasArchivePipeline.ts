import { Context, Effect, Layer, Cause } from "effect"
import { join } from "node:path"
import type { AnnasArchiveResult } from "@inkpipe/shared"
import { PipelineError } from "@inkpipe/shared"
import { JobStoreService } from "../storage/JobStore"
import { AnnasArchiveService, guessExtensionFromUrl } from "../integrations/AnnasArchive"
import { CopypartyService } from "../integrations/Copyparty"
import { FileManagerService } from "./FileManager"
import { ConfigService } from "../core/Config"
import { LogService } from "../core/Log"

export class AnnasArchivePipelineService extends Context.Service<
  AnnasArchivePipelineService,
  {
    readonly run: (result: AnnasArchiveResult, subfolder?: string, createdFolder?: boolean) => Effect.Effect<void, PipelineError>
  }
>()("AnnasArchivePipelineService") {}

function sanitizeFilename(title: string): string {
  return title.replace(/[/\\?%*:|"<>]/g, "_").trim() || "download"
}

export const AnnasArchivePipelineServiceLive = Layer.effect(
  AnnasArchivePipelineService,
  Effect.gen(function* () {
    const jobStore = yield* JobStoreService
    const annasArchive = yield* AnnasArchiveService
    const copyparty = yield* CopypartyService
    const fileManager = yield* FileManagerService
    const configService = yield* ConfigService
    const log = yield* LogService

    const run = (result: AnnasArchiveResult, subfolder?: string, createdFolder?: boolean) =>
      Effect.gen(function* () {
        yield* log.info("annas-archive-pipeline", "Starting pipeline for:", result.title)

        const job = yield* jobStore.createJob(result.title)
        const jl = log.withJob(String(job.id))
        yield* jl.info("jobs", "Created job")

        const pipelineBody = Effect.gen(function* () {
          // Stage 1: Download — AnnasArchiveService.getDownloadUrl already
          // fails over across Anna's Archive's known mirror domains internally.
          yield* jl.info("pipeline", "Stage: DOWNLOADING")
          yield* jobStore.updateJob(job.id, { stage: "DOWNLOADING", progress: 0 })
          const jobDir = yield* fileManager.ensureJobDir(String(job.id))
          yield* jl.info("pipeline", "Job dir:", jobDir)

          const downloadUrl = yield* annasArchive.getDownloadUrl(result.md5).pipe(
            Effect.mapError((e) => new PipelineError({ message: e.message })),
          )

          let extension = result.extension
          if (!extension) {
            extension = guessExtensionFromUrl(downloadUrl)
            if (!extension) {
              yield* jl.warn(
                "pipeline",
                `Could not determine a file extension for "${result.title}" from search metadata or the download URL — saving as .bin`,
              )
              extension = "bin"
            }
          }

          const destPath = join(jobDir, `${sanitizeFilename(result.title)}.${extension}`)
          yield* jl.info("pipeline", "Downloading to:", destPath)
          yield* annasArchive.downloadFile(downloadUrl, destPath, (received, total) => {
            if (total > 0) {
              Effect.runFork(
                jobStore.updateJob(job.id, { progress: Math.round((received / total) * 100) }),
              )
            }
          }).pipe(
            Effect.mapError((e) => new PipelineError({ message: e.message })),
          )

          // Stage 2: Copyparty upload (no conversion — books are already in their final format)
          const config = yield* configService.loadConfig
          if (config.copyparty.url) {
            yield* jl.info("pipeline", "Stage: UPLOADING_COPYPARTY")
            yield* jobStore.updateJob(job.id, { stage: "UPLOADING_COPYPARTY", progress: 0 })
            yield* copyparty.uploadFile(destPath, subfolder).pipe(
              Effect.mapError((e) => new PipelineError({ message: e.message })),
            )
            yield* jl.info("pipeline", "Copyparty upload complete")
          } else {
            yield* jl.info("pipeline", "Copyparty not configured, skipping upload")
          }

          // Done
          yield* jl.info("pipeline", "Stage: DONE")
          yield* jobStore.updateJob(job.id, { stage: "DONE", progress: 100 })
        })

        const cleanup = Effect.gen(function* () {
          yield* jl.info("pipeline", "Cleaning up")
          yield* Effect.catch(
            fileManager.cleanupJobDir(String(job.id)),
            () => Effect.void,
          )
        })

        yield* pipelineBody.pipe(
          Effect.catchCause((cause) => {
            const e = Cause.squash(cause)
            const message = e instanceof Error ? e.message : String(e)
            return Effect.gen(function* () {
              yield* jl.error("pipeline", "FAILED:", message)
              yield* jobStore.updateJob(job.id, { stage: "FAILED", error: message })
              if (createdFolder && subfolder) {
                yield* Effect.catch(
                  copyparty.deleteFolder(subfolder),
                  () => Effect.void,
                )
              }
            })
          }),
          Effect.ensuring(cleanup),
        )
      })

    return { run }
  }),
)
