import { Context, Effect, Layer } from "effect"
import type { ProwlarrResult } from "@inkpipe/shared"
import { PipelineError } from "@inkpipe/shared"
import { JobStoreService } from "../storage/JobStore"
import { AllDebridService } from "../integrations/AllDebrid"
import type { KccService } from "../integrations/Kcc"
import type { CopypartyService } from "../integrations/Copyparty"
import { FileManagerService } from "./FileManager"
import { runPipelineMachine } from "./PipelineMachine"
import type { ConfigService } from "../core/Config"
import { LogService } from "../core/Log"

export class PipelineService extends Context.Service<
  PipelineService,
  {
    readonly runPipeline: (
      result: ProwlarrResult,
      subfolder?: string,
      createdFolder?: boolean,
    ) => Effect.Effect<void, PipelineError>
  }
>()("PipelineService") {}

export const PipelineServiceLive = Layer.effect(
  PipelineService,
  Effect.gen(function* () {
    const jobStore = yield* JobStoreService
    const alldebrid = yield* AllDebridService
    const fileManager = yield* FileManagerService
    const log = yield* LogService
    const services = yield* Effect.context<
      | JobStoreService
      | AllDebridService
      | KccService
      | CopypartyService
      | FileManagerService
      | ConfigService
      | LogService
    >()

    const runPipeline = (result: ProwlarrResult, subfolder?: string, createdFolder?: boolean) =>
      Effect.gen(function* () {
        yield* log.info("pipeline", "Starting pipeline for:", result.title)
        yield* log.info("pipeline", "magnetUrl:", result.magnetUrl)
        yield* log.info("pipeline", "downloadUrl:", result.downloadUrl)

        const magnetOrUrl = result.magnetUrl ?? result.downloadUrl
        if (!magnetOrUrl) {
          yield* log.error("pipeline", "No magnet or download URL for:", result.title)
          return yield* new PipelineError({
            message: `No magnet or download URL for "${result.title}"`,
          })
        }

        const job = yield* jobStore.createJob(result.title)
        const jl = log.withJob(String(job.id))
        yield* jl.info("jobs", "Created job")

        // The machine records the failure on the job; the run then fails too, so callers that wait
        // on it (the Telegram listener) report the real outcome.
        const outcome = yield* runPipelineMachine({
          jobId: job.id,
          magnetOrUrl,
          subfolder,
          createdFolder: createdFolder ?? false,
          cleanup: (magnetId) =>
            Effect.gen(function* () {
              yield* jl.info("pipeline", "Cleaning up")
              yield* Effect.ignore(fileManager.cleanupJobDir(String(job.id)))
              if (magnetId !== null) {
                yield* Effect.ignore(alldebrid.deleteMagnet(magnetId))
              }
            }),
        }).pipe(Effect.provideContext(services))

        if (outcome._tag === "Failed") {
          return yield* new PipelineError({ message: outcome.message })
        }
      })

    return { runPipeline }
  }),
)
