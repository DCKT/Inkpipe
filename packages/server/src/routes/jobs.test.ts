import { Effect, Layer } from "effect"
import { describe, it, expect } from "vitest"
import type { Job } from "@inkpipe/shared"
import { jobsHandler } from "../routes/jobs"
import { JobStoreService } from "../layers/JobStore"

const mockJobs: Job[] = [
  {
    id: "1", title: "Naruto T01", stage: "DONE", progress: 100,
    startedAt: 1700000000000,
  },
  {
    id: "2", title: "One Piece v1", stage: "DOWNLOADING", progress: 42,
    startedAt: 1700000001000,
  },
]

describe("jobsHandler", () => {
  it("returns jobs as JSON", async () => {
    const layer = Layer.succeed(JobStoreService, {
      createJob: () => Effect.succeed(mockJobs[0]),
      updateJob: () => Effect.void,
      getJob: () => Effect.succeed({ _tag: "None" } as any),
      getAllJobs: Effect.succeed(mockJobs),
    } as any)

    const response = await Effect.runPromise(
      jobsHandler.pipe(Effect.provide(layer)),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body).toEqual(mockJobs)
  })

  it("returns 500 with error message on failure", async () => {
    const layer = Layer.succeed(JobStoreService, {
      createJob: () => Effect.succeed(mockJobs[0]),
      updateJob: () => Effect.void,
      getJob: () => Effect.succeed({ _tag: "None" } as any),
      getAllJobs: Effect.fail({ message: "DB error" } as any),
    } as any)

    const response = await Effect.runPromise(
      jobsHandler.pipe(Effect.provide(layer)),
    )

    expect(response.status).toBe(500)
    const body = await response.json() as any
    expect(body.error).toBe("DB error")
  })
})
