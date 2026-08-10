import { Effect, Layer, Option } from "effect"
import { describe, it, expect, beforeEach, afterEach, vi } from "@effect/vitest"
import { JobId } from "@inkpipe/shared"
import { JobStoreService, JobStoreServiceLive } from "./JobStore"
import { testDbLayer } from "../../__mocks__/testDb"
import { subscribeJobEvents, subscribeJobListEvents } from "../../lib/jobEvents"

function makeProgram<T, E>(prog: (svc: typeof JobStoreService.Service) => Effect.Effect<T, E>) {
  return Effect.gen(function* () {
    const svc = yield* JobStoreService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(JobStoreServiceLive, testDbLayer)))
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("JobStoreService", () => {
  it.effect("createJob inserts a row with UPLOADING/0 and publishes a job event", () =>
    Effect.gen(function* () {
      const published: unknown[] = []
      const unsubscribe = subscribeJobEvents((job) => published.push(job))

      const job = yield* makeProgram((svc) => svc.createJob("My Book"))

      unsubscribe()
      expect(job.title).toBe("My Book")
      expect(job.stage).toBe("UPLOADING")
      expect(job.progress).toBe(0)
      expect(published).toEqual([job])
    }))

  it.effect("updateJob applies only the recognized fields and publishes the updated row", () =>
    Effect.gen(function* () {
      const published: unknown[] = []
      const unsubscribe = subscribeJobEvents((job) => published.push(job))

      const { job, updated } = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const created = yield* svc.createJob("Book")
          yield* svc.updateJob(created.id, { stage: "DOWNLOADING", progress: 42 })
          const fetched = yield* svc.getJob(created.id)
          return { job: created, updated: Option.getOrThrow(fetched) }
        }),
      )

      unsubscribe()
      expect(updated.stage).toBe("DOWNLOADING")
      expect(updated.progress).toBe(42)
      expect(updated.id).toBe(job.id)
      // one publish for createJob, one for updateJob
      expect(published.length).toBe(2)
    }))

  it.effect("updateJob with no recognized fields is a no-op: no DB write, no publish", () =>
    Effect.gen(function* () {
      const published: unknown[] = []

      const { before, after } = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const created = yield* svc.createJob("Book")
          const unsubscribe = subscribeJobEvents((job) => published.push(job))
          const beforeRow = Option.getOrThrow(yield* svc.getJob(created.id))
          // `filename` isn't one of the fields updateJob whitelists (stage/progress/error/startedAt)
          yield* svc.updateJob(created.id, {} as any)
          const afterRow = Option.getOrThrow(yield* svc.getJob(created.id))
          unsubscribe()
          return { before: beforeRow, after: afterRow }
        }),
      )

      expect(after).toEqual(before)
      expect(published).toEqual([])
    }))

  it.effect("getJob returns None for a nonexistent id", () =>
    Effect.gen(function* () {
      const result = yield* makeProgram((svc) => svc.getJob(JobId.make(999999)))
      expect(Option.isNone(result)).toBe(true)
    }))

  it.effect("getAllJobs returns every created job", () =>
    Effect.gen(function* () {
      const jobs = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          yield* svc.createJob("A")
          yield* svc.createJob("B")
          return yield* svc.getAllJobs
        }),
      )
      expect(jobs.map((j) => j.title).sort()).toEqual(["A", "B"])
    }))

  it.effect("deleteCompletedJobs removes only DONE/FAILED jobs and returns the count", () =>
    Effect.gen(function* () {
      const remaining = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const active = yield* svc.createJob("Active")
          const done = yield* svc.createJob("Done")
          const failed = yield* svc.createJob("Failed")
          yield* svc.updateJob(done.id, { stage: "DONE" })
          yield* svc.updateJob(failed.id, { stage: "FAILED", error: "boom" })

          const deleted = yield* svc.deleteCompletedJobs
          expect(deleted).toBe(2)

          const remainingJobs = yield* svc.getAllJobs
          return { remainingJobs, active }
        }),
      )
      expect(remaining.remainingJobs.map((j) => j.id)).toEqual([remaining.active.id])
    }))

  it.effect("deleteCompletedJobs is a no-op and returns 0 when nothing is completed", () =>
    Effect.gen(function* () {
      const deleted = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          yield* svc.createJob("Still going")
          return yield* svc.deleteCompletedJobs
        }),
      )
      expect(deleted).toBe(0)
    }))

  it.effect("broadcastJobs published via subscribeJobListEvents is independent of per-job events", () =>
    Effect.gen(function* () {
      const listEvents: unknown[][] = []
      const unsubscribe = subscribeJobListEvents((jobs) => listEvents.push(jobs))
      yield* makeProgram((svc) => svc.createJob("Book"))
      unsubscribe()
      // JobStoreService itself never calls broadcastJobs (only publishJobEvent) —
      // that wiring lives in the API handlers, so no list-event should fire here.
      expect(listEvents).toEqual([])
    }))
})
