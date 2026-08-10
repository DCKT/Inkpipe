import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { JobStoreService } from "../../layers/storage/JobStore"
import { broadcastJobs } from "../../lib/jobEvents"
import { InkpipeApi } from "@inkpipe/shared"

export const JobsGroupLive = HttpApiBuilder.group(InkpipeApi, "jobs", (handlers) =>
  handlers
    .handle("list", () =>
      Effect.gen(function* () {
        const jobStore = yield* JobStoreService
        const jobs = yield* jobStore.getAllJobs
        return { jobs }
      }))
    .handle("clear", () =>
      Effect.gen(function* () {
        const jobStore = yield* JobStoreService
        const deleted = yield* jobStore.deleteCompletedJobs
        const jobs = yield* jobStore.getAllJobs
        broadcastJobs(jobs)
        return { deleted }
      })),
)
