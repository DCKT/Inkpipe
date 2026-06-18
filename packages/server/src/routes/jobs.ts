import { Effect } from "effect"
import { JobStoreService } from "../layers/JobStore"

export const jobsHandler = Effect.gen(function* () {
  const jobStore = yield* JobStoreService
  const jobs = yield* jobStore.getAllJobs
  return Response.json(jobs)
}).pipe(
  Effect.catchAll((e: { message: string }) =>
    Effect.succeed(
      Response.json({ error: e.message }, { status: 500 }),
    ),
  ),
)

export const clearJobsHandler = Effect.gen(function* () {
  const jobStore = yield* JobStoreService
  const deleted = yield* jobStore.deleteCompletedJobs
  return Response.json({ deleted })
}).pipe(
  Effect.catchAll((e: { message: string }) =>
    Effect.succeed(
      Response.json({ error: e.message }, { status: 500 }),
    ),
  ),
)
