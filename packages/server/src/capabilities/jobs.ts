import { implement } from "@inkpipe/capability/implement"
import { clearJobsContract, listJobsContract } from "@inkpipe/shared"
import { Effect } from "effect"
import { JobStoreService } from "../layers/storage/JobStore"
import { broadcastJobs } from "../lib/jobEvents"

export const listJobs = implement(listJobsContract, () =>
  JobStoreService.use((jobStore) => jobStore.getAllJobs).pipe(Effect.map((jobs) => ({ jobs }))),
)

export const clearJobs = implement(clearJobsContract, () =>
  Effect.gen(function* () {
    const jobStore = yield* JobStoreService
    const deleted = yield* jobStore.deleteCompletedJobs
    const jobs = yield* jobStore.getAllJobs
    broadcastJobs(jobs)
    return { deleted }
  }),
)

export const jobsCapabilities = [listJobs, clearJobs] as const
