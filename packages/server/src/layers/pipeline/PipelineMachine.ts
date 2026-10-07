import { watchActor } from "@inkpipe/capability/actor-watch"
import { createEffectActor, fromEffect, join, setupEffect } from "@xstate/effect"
import { Data, Deferred, Duration, Effect, Schema } from "effect"
import { join as joinPath } from "node:path"
import { types } from "xstate"
import type { DebridFile } from "@inkpipe/shared"
import { DebridFileSchema, JobId, PipelineError } from "@inkpipe/shared"
import { AllDebridService } from "../integrations/AllDebrid"
import { CopypartyService } from "../integrations/Copyparty"
import { KccService } from "../integrations/Kcc"
import { ConfigService } from "../core/Config"
import { LogService } from "../core/Log"
import { JobStoreService } from "../storage/JobStore"
import { FileManagerService } from "./FileManager"

// Lifecycle of one debrid → convert → upload job.
//
//   uploading ─ready─────────────────────────────┐
//       │                                         ▼
//       └─not ready→ markProcessing → polling ⇄ waiting ──ready──→ fetchingFiles
//   fetchingFiles → downloading → converting → uploadingCopyparty → finishing → done
//   any failure → failing → failed
//
// XState owns the transitions and the poll cadence (`after` on Effect's Clock).
// Effect owns every side effect, typed error and service dependency.

export const POLL_INTERVAL = Duration.seconds(3)

export type PipelineOutcome = Data.TaggedEnum<{
  Done: {}
  Failed: { readonly message: string }
}>

export const pipelineOutcome = Data.taggedEnum<PipelineOutcome>()

interface PipelineContext {
  readonly jobId: JobId
  readonly magnetOrUrl: string
  readonly subfolder: string | undefined
  readonly createdFolder: boolean
  readonly magnetId: number | null
  readonly pollCount: number
  readonly files: ReadonlyArray<DebridFile>
  readonly jobDir: string
  readonly outcome: PipelineOutcome | undefined
  /** Why the job is failing; read by the `failing` state. */
  readonly failure: { readonly message: string; readonly stack: string | undefined } | undefined
}

// @xstate/effect interrupts in-flight task fibers when the actor stops, but does not wait for them
// to unwind. Every task registers here so cleanup can wait until the work has really stopped
// before it removes the job directory and the magnet from under it.
const running = new Map<JobId, Set<Deferred.Deferred<void>>>()

const tracked = <A, E, R>(jobId: JobId, effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const done = yield* Deferred.make<void>()
    const tasks = running.get(jobId) ?? new Set<Deferred.Deferred<void>>()
    tasks.add(done)
    running.set(jobId, tasks)
    return yield* effect.pipe(
      Effect.ensuring(
        Effect.suspend(() => {
          tasks.delete(done)
          if (tasks.size === 0) running.delete(jobId)
          return Deferred.succeed(done, undefined)
        }),
      ),
    )
  })

const awaitStopped = (jobId: JobId) =>
  Effect.suspend(() =>
    Effect.forEach([...(running.get(jobId) ?? [])], (done) => Deferred.await(done), {
      discard: true,
    }),
  )

const JobInput = Schema.Struct({ jobId: JobId })

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const jobLog = (jobId: JobId) => LogService.use((log) => Effect.succeed(log.withJob(String(jobId))))

const progressOf = (index: number, count: number) => Math.round(((index + 1) / count) * 100)

const uploadMagnet = fromEffect({
  schemas: { input: Schema.Struct({ jobId: JobId, magnetOrUrl: Schema.String }) },
  effect: ({ input }) =>
    tracked(
      input.jobId,
      Effect.gen(function* () {
        const jl = yield* jobLog(input.jobId)
        const jobStore = yield* JobStoreService
        const alldebrid = yield* AllDebridService
        yield* jl.info("pipeline", "Stage: UPLOADING")
        yield* jobStore.updateJob(input.jobId, { stage: "UPLOADING", progress: 50 })
        const upload = yield* alldebrid.uploadMagnet(input.magnetOrUrl)
        yield* jl.info("pipeline", "Magnet uploaded, id:", upload.id, "ready:", upload.ready)
        if (upload.ready) {
          yield* jl.info("pipeline", "Already ready at upload, skipping poll")
        }
        return { magnetId: upload.id, ready: upload.ready }
      }),
    ),
})

const markProcessing = fromEffect({
  schemas: { input: JobInput },
  effect: ({ input }) =>
    tracked(
      input.jobId,
      Effect.gen(function* () {
        const jl = yield* jobLog(input.jobId)
        const jobStore = yield* JobStoreService
        yield* jl.info("pipeline", "Stage: DEBRID_PROCESSING")
        yield* jobStore.updateJob(input.jobId, { stage: "DEBRID_PROCESSING", progress: 50 })
      }),
    ),
})

const checkMagnet = fromEffect({
  schemas: {
    input: Schema.Struct({ jobId: JobId, magnetId: Schema.Finite, pollCount: Schema.Finite }),
  },
  effect: ({ input }) =>
    tracked(
      input.jobId,
      Effect.gen(function* () {
        const jl = yield* jobLog(input.jobId)
        const alldebrid = yield* AllDebridService
        const status = yield* alldebrid.getMagnetStatus(input.magnetId)
        if (status.status === "Ready") {
          yield* jl.info("pipeline", "Debrid ready after", input.pollCount, "polls")
          return true
        }
        if (status.statusCode >= 5) {
          return yield* new PipelineError({
            message: `AllDebrid magnet error: ${status.status} (code ${status.statusCode})`,
          })
        }
        yield* jl.info(
          "pipeline",
          `Debrid not ready (poll #${input.pollCount}, status: ${status.status}), waiting...`,
        )
        return false
      }),
    ),
})

const fetchFiles = fromEffect({
  schemas: {
    input: Schema.Struct({ jobId: JobId, magnetId: Schema.Finite }),
    output: Schema.Array(DebridFileSchema),
  },
  effect: ({ input }) =>
    tracked(
      input.jobId,
      Effect.gen(function* () {
        const jl = yield* jobLog(input.jobId)
        const alldebrid = yield* AllDebridService
        const files = yield* alldebrid.getMagnetFiles(input.magnetId)
        yield* jl.info("pipeline", "Got", files.length, "files from AllDebrid")
        if (files.length === 0) {
          return yield* new PipelineError({ message: "No files returned from AllDebrid" })
        }
        return files
      }),
    ),
})

const downloadFiles = fromEffect({
  schemas: { input: Schema.Struct({ jobId: JobId, files: Schema.Array(DebridFileSchema) }) },
  effect: ({ input }) =>
    tracked(
      input.jobId,
      Effect.gen(function* () {
        const jl = yield* jobLog(input.jobId)
        const jobStore = yield* JobStoreService
        const alldebrid = yield* AllDebridService
        const fileManager = yield* FileManagerService
        const context = yield* Effect.context<never>()
        const { files } = input

        yield* jl.info("pipeline", `Stage: DOWNLOADING (${files.length} files)`)
        yield* jobStore.updateJob(input.jobId, { stage: "DOWNLOADING" })
        const jobDir = yield* fileManager.ensureJobDir(String(input.jobId))
        yield* jl.info("pipeline", "Job dir:", jobDir)

        for (const [i, file] of files.entries()) {
          yield* jl.info("pipeline", `Unlocking file ${i + 1}/${files.length}:`, file.filename)
          const unlocked = yield* alldebrid.unlockLink(file.link)
          const destPath = joinPath(jobDir, unlocked.filename)
          yield* jl.info("pipeline", "Downloading to:", destPath, `(${unlocked.size} bytes)`)
          yield* alldebrid.downloadFile(unlocked.url, destPath, (received, total) => {
            if (total > 0) {
              Effect.runForkWith(context)(
                jobStore.updateJob(input.jobId, {
                  progress: Math.round(((i + received / total) / files.length) * 100),
                }),
              )
            }
          })
        }
        return jobDir
      }),
    ),
})

const convert = fromEffect({
  schemas: { input: Schema.Struct({ jobId: JobId, jobDir: Schema.String }) },
  effect: ({ input }) =>
    tracked(
      input.jobId,
      Effect.gen(function* () {
        const jl = yield* jobLog(input.jobId)
        const jobStore = yield* JobStoreService
        const kcc = yield* KccService
        const fileManager = yield* FileManagerService
        const { jobDir } = input

        const epubFile = yield* fileManager.findFileByExtension(jobDir, [".epub"])
        if (epubFile) {
          yield* jl.info("pipeline", "Already an EPUB, skipping conversion:", epubFile)
          return
        }

        yield* jl.info("pipeline", "Stage: CONVERTING")
        yield* jobStore.updateJob(input.jobId, { stage: "CONVERTING" })
        const comicFiles = yield* fileManager.findAllFilesByExtension(jobDir, [
          ".cbz",
          ".cbr",
          ".zip",
          ".rar",
          ".pdf",
        ])
        if (comicFiles.length === 0) {
          yield* jl.info("pipeline", "No convertible file found, skipping conversion")
          return
        }
        for (const [i, file] of comicFiles.entries()) {
          let kccInput = file
          if (file.toLowerCase().endsWith(".cbr") || file.toLowerCase().endsWith(".rar")) {
            yield* jl.info("pipeline", "Extracting RAR archive:", file)
            kccInput = yield* fileManager.extractRarArchive(file)
          }
          yield* jl.info("pipeline", "Converting:", kccInput)
          yield* kcc.convert(kccInput, jobDir)
          yield* jobStore.updateJob(input.jobId, { progress: progressOf(i, comicFiles.length) })
        }
        yield* jl.info("pipeline", `Conversion complete (${comicFiles.length} file(s))`)
      }),
    ),
})

const uploadCopyparty = fromEffect({
  schemas: {
    input: Schema.Struct({
      jobId: JobId,
      jobDir: Schema.String,
      subfolder: Schema.UndefinedOr(Schema.String),
    }),
  },
  effect: ({ input }) =>
    tracked(
      input.jobId,
      Effect.gen(function* () {
        const jl = yield* jobLog(input.jobId)
        const jobStore = yield* JobStoreService
        const copyparty = yield* CopypartyService
        const fileManager = yield* FileManagerService
        const configService = yield* ConfigService
        const { jobDir } = input

        const config = yield* configService.loadConfig
        if (!config.copyparty.url) {
          yield* jl.info("pipeline", "Copyparty not configured, skipping upload")
          return
        }

        yield* jl.info("pipeline", "Stage: UPLOADING_COPYPARTY")
        yield* jobStore.updateJob(input.jobId, { stage: "UPLOADING_COPYPARTY" })

        let filesToUpload = yield* fileManager.findAllFilesByExtension(jobDir, [".epub"])
        if (filesToUpload.length === 0) {
          filesToUpload = yield* fileManager.findAllFilesByExtension(jobDir, [".cbz", ".cbr"])
        }
        if (filesToUpload.length === 0) {
          filesToUpload = yield* fileManager.findAllFilesByExtension(jobDir, [
            ".zip",
            ".rar",
            ".pdf",
          ])
        }
        if (filesToUpload.length === 0) {
          yield* jl.info("pipeline", "No file found to upload to Copyparty")
          return
        }

        for (const [i, file] of filesToUpload.entries()) {
          yield* jl.info("pipeline", "Uploading to Copyparty:", file)
          yield* copyparty.uploadFile(file, input.subfolder)
          yield* jobStore.updateJob(input.jobId, { progress: progressOf(i, filesToUpload.length) })
        }
        yield* jl.info("pipeline", `Copyparty upload complete (${filesToUpload.length} file(s))`)
      }),
    ),
})

const markDone = fromEffect({
  schemas: { input: JobInput },
  effect: ({ input }) =>
    tracked(
      input.jobId,
      Effect.gen(function* () {
        const jl = yield* jobLog(input.jobId)
        const jobStore = yield* JobStoreService
        yield* jl.info("pipeline", "Stage: DONE")
        yield* jobStore.updateJob(input.jobId, { stage: "DONE" })
      }),
    ),
})

const recordFailure = fromEffect({
  schemas: {
    input: Schema.Struct({
      jobId: JobId,
      message: Schema.String,
      stack: Schema.UndefinedOr(Schema.String),
      subfolder: Schema.UndefinedOr(Schema.String),
      createdFolder: Schema.Boolean,
    }),
  },
  effect: ({ input }) =>
    tracked(
      input.jobId,
      Effect.gen(function* () {
        const jl = yield* jobLog(input.jobId)
        const jobStore = yield* JobStoreService
        const copyparty = yield* CopypartyService
        yield* jl.error("pipeline", "FAILED:", input.message)
        if (input.stack) {
          yield* jl.error("pipeline", "Stack:", input.stack)
        }
        yield* jobStore.updateJob(input.jobId, { stage: "FAILED", error: input.message })
        if (input.createdFolder && input.subfolder) {
          yield* Effect.ignore(copyparty.deleteFolder(input.subfolder))
        }
      }),
    ),
})

const failureOf = (error: unknown) => ({
  message: errorMessage(error),
  stack: error instanceof Error ? error.stack : undefined,
})

export const pipelineMachine = setupEffect({
  actors: {
    uploadMagnet,
    markProcessing,
    checkMagnet,
    fetchFiles,
    downloadFiles,
    convert,
    uploadCopyparty,
    markDone,
    recordFailure,
  },
  schemas: {
    context: types<PipelineContext>(),
    input: Schema.Struct({
      jobId: JobId,
      magnetOrUrl: Schema.String,
      subfolder: Schema.UndefinedOr(Schema.String),
      createdFolder: Schema.Boolean,
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    ...input,
    magnetId: null,
    pollCount: 0,
    files: [],
    jobDir: "",
    outcome: undefined,
    failure: undefined,
  }),
  initial: "uploading",
  output: ({ context }) => ({ outcome: context.outcome, magnetId: context.magnetId }),
  states: {
    uploading: {
      invoke: {
        src: "uploadMagnet",
        input: ({ context }) => ({ jobId: context.jobId, magnetOrUrl: context.magnetOrUrl }),
        onDone: ({ context, event }) => ({
          target: event.output.ready ? "fetchingFiles" : "markProcessing",
          context: { ...context, magnetId: event.output.magnetId },
        }),
        onError: ({ context, event }) => ({
          target: "failing",
          context: { ...context, failure: failureOf(event.error) },
        }),
      },
    },
    markProcessing: {
      invoke: {
        src: "markProcessing",
        input: ({ context }) => ({ jobId: context.jobId }),
        onDone: { target: "polling" },
        onError: ({ context, event }) => ({
          target: "failing",
          context: { ...context, failure: failureOf(event.error) },
        }),
      },
    },
    polling: {
      invoke: {
        src: "checkMagnet",
        input: ({ context }) => ({
          jobId: context.jobId,
          magnetId: context.magnetId ?? 0,
          pollCount: context.pollCount + 1,
        }),
        onDone: ({ context, event }) => ({
          target: event.output ? "fetchingFiles" : "waiting",
          context: { ...context, pollCount: context.pollCount + 1 },
        }),
        onError: ({ context, event }) => ({
          target: "failing",
          context: { ...context, failure: failureOf(event.error) },
        }),
      },
    },
    waiting: {
      after: { [Duration.toMillis(POLL_INTERVAL)]: { target: "polling" } },
    },
    fetchingFiles: {
      invoke: {
        src: "fetchFiles",
        input: ({ context }) => ({ jobId: context.jobId, magnetId: context.magnetId ?? 0 }),
        onDone: ({ context, event }) => ({
          target: "downloading",
          context: { ...context, files: event.output },
        }),
        onError: ({ context, event }) => ({
          target: "failing",
          context: { ...context, failure: failureOf(event.error) },
        }),
      },
    },
    downloading: {
      invoke: {
        src: "downloadFiles",
        input: ({ context }) => ({ jobId: context.jobId, files: context.files }),
        onDone: ({ context, event }) => ({
          target: "converting",
          context: { ...context, jobDir: event.output },
        }),
        onError: ({ context, event }) => ({
          target: "failing",
          context: { ...context, failure: failureOf(event.error) },
        }),
      },
    },
    converting: {
      invoke: {
        src: "convert",
        input: ({ context }) => ({ jobId: context.jobId, jobDir: context.jobDir }),
        onDone: { target: "uploadingCopyparty" },
        onError: ({ context, event }) => ({
          target: "failing",
          context: { ...context, failure: failureOf(event.error) },
        }),
      },
    },
    uploadingCopyparty: {
      invoke: {
        src: "uploadCopyparty",
        input: ({ context }) => ({
          jobId: context.jobId,
          jobDir: context.jobDir,
          subfolder: context.subfolder,
        }),
        onDone: { target: "finishing" },
        onError: ({ context, event }) => ({
          target: "failing",
          context: { ...context, failure: failureOf(event.error) },
        }),
      },
    },
    finishing: {
      invoke: {
        src: "markDone",
        input: ({ context }) => ({ jobId: context.jobId }),
        onDone: ({ context }) => ({
          target: "done",
          context: { ...context, outcome: pipelineOutcome.Done() },
        }),
        onError: ({ context, event }) => ({
          target: "failing",
          context: { ...context, failure: failureOf(event.error) },
        }),
      },
    },
    failing: {
      invoke: {
        src: "recordFailure",
        input: ({ context }) => ({
          jobId: context.jobId,
          message: context.failure?.message ?? "Unknown error",
          stack: context.failure?.stack,
          subfolder: context.subfolder,
          createdFolder: context.createdFolder,
        }),
        // Recording the failure is best-effort; the job still ends as Failed.
        onDone: ({ context }) => ({
          target: "failed",
          context: {
            ...context,
            outcome: pipelineOutcome.Failed({ message: context.failure?.message ?? "" }),
          },
        }),
        onError: ({ context }) => ({
          target: "failed",
          context: {
            ...context,
            outcome: pipelineOutcome.Failed({ message: context.failure?.message ?? "" }),
          },
        }),
      },
    },
    done: { type: "final" },
    failed: { type: "final" },
  },
})

export interface PipelineRunInput {
  readonly jobId: JobId
  readonly magnetOrUrl: string
  readonly subfolder: string | undefined
  readonly createdFolder: boolean
  /** Runs when the machine stops for any reason, including interruption. */
  readonly cleanup: (magnetId: number | null) => Effect.Effect<void>
}

export const runPipelineMachine = Effect.fn("runPipelineMachine")(function* (
  input: PipelineRunInput,
) {
  const { cleanup, ...machineInput } = input

  // Registered before the actor exists, so it runs after the actor's own finalizers. It also waits
  // for in-flight tasks to unwind, so the directory and magnet are removed only once work stopped.
  const started: { actor?: { getSnapshot: () => { context: { magnetId: number | null } } } } = {}
  yield* Effect.addFinalizer(() =>
    awaitStopped(machineInput.jobId).pipe(
      Effect.andThen(cleanup(started.actor?.getSnapshot().context.magnetId ?? null)),
    ),
  )

  const actor = yield* createEffectActor(pipelineMachine, { input: machineInput })
  started.actor = actor
  yield* watchActor("pipelineMachine", actor)
  // A machine-level error is a bug: product failures travel through the `failed` state.
  // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- `join` exposes an unknown machine error channel; orDie closes it.
  const result = yield* join(actor).pipe(Effect.orDie)
  if (result === undefined || result.outcome === undefined) {
    return yield* Effect.die(new Error("pipelineMachine completed without an outcome"))
  }
  return result.outcome
}, Effect.scoped)
