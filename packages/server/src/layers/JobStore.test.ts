import { Effect, Option } from "effect"
import { describe, it, expect, beforeEach } from "vitest"
import { resetMockDb } from "../__mocks__/bun-sqlite"
import { JobStoreService, JobStoreServiceLive } from "./JobStore"

beforeEach(() => {
  resetMockDb()
})

describe("JobStoreService", () => {
  describe("createJob", () => {
    it("creates a job with correct initial fields", async () => {
      const job = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          return yield* svc.createJob("My Title")
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      expect(job.id).toBeTypeOf("string")
      expect(job.title).toBe("My Title")
      expect(job.stage).toBe("UPLOADING")
      expect(job.progress).toBe(0)
      expect(job.startedAt).toBeGreaterThan(0)
      expect(job.error).toBeUndefined()
    })

    it("persists the job and can be retrieved", async () => {
      const job = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          const created = yield* svc.createJob("Persisted Job")
          const retrieved = yield* svc.getJob(created.id)
          return { created, retrieved }
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      expect(Option.getOrNull(job.retrieved)!.title).toBe("Persisted Job")
    })

    it("assigns incrementing string IDs", async () => {
      const jobs = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          const j1 = yield* svc.createJob("First")
          const j2 = yield* svc.createJob("Second")
          const j3 = yield* svc.createJob("Third")
          return [j1, j2, j3] as const
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      // IDs are string numbers that increment
      expect(Number(jobs[0].id)).toBeLessThan(Number(jobs[1].id))
      expect(Number(jobs[1].id)).toBeLessThan(Number(jobs[2].id))
    })
  })

  describe("updateJob", () => {
    it("updates the stage", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          const job = yield* svc.createJob("Update Test")
          yield* svc.updateJob(job.id, { stage: "DOWNLOADING" })
          return yield* svc.getJob(job.id)
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      expect(Option.getOrNull(result)!.stage).toBe("DOWNLOADING")
    })

    it("updates the progress", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          const job = yield* svc.createJob("Progress Test")
          yield* svc.updateJob(job.id, { progress: 75 })
          return yield* svc.getJob(job.id)
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      expect(Option.getOrNull(result)!.progress).toBe(75)
    })

    it("updates the error field", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          const job = yield* svc.createJob("Error Test")
          yield* svc.updateJob(job.id, { error: "Something went wrong" })
          return yield* svc.getJob(job.id)
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      expect(Option.getOrNull(result)!.error).toBe("Something went wrong")
    })

    it("updates multiple fields at once", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          const job = yield* svc.createJob("Multi Update")
          yield* svc.updateJob(job.id, {
            stage: "CONVERTING",
            progress: 50,
            error: "partial",
          })
          return yield* svc.getJob(job.id)
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      const j = Option.getOrNull(result)!
      expect(j.stage).toBe("CONVERTING")
      expect(j.progress).toBe(50)
      expect(j.error).toBe("partial")
    })

    it("does not throw when updating with empty fields", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          const job = yield* svc.createJob("Empty Update")
          yield* svc.updateJob(job.id, {})
          const retrieved = yield* svc.getJob(job.id)
          expect(Option.getOrNull(retrieved)!.stage).toBe("UPLOADING")
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )
    })

    it("does not throw when updating non-existent job", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          // Should not throw
          yield* svc.updateJob("nonexistent", { stage: "DONE" })
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )
    })
  })

  describe("getJob", () => {
    it("returns Option.none for non-existent job", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          return yield* svc.getJob("does-not-exist")
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      expect(Option.isNone(result)).toBe(true)
    })

    it("returns Option.some for existing job", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          const job = yield* svc.createJob("Find Me")
          return yield* svc.getJob(job.id)
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      expect(Option.isSome(result)).toBe(true)
      expect(Option.getOrNull(result)!.title).toBe("Find Me")
    })

    it("getJob returns the job with all fields intact", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          const job = yield* svc.createJob("Full Fields")
          return yield* svc.getJob(job.id)
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      const j = Option.getOrNull(result)!
      expect(j.id).toBeTypeOf("string")
      expect(j.title).toBe("Full Fields")
      expect(j.stage).toBe("UPLOADING")
      expect(j.progress).toBe(0)
      expect(j.startedAt).toBeTypeOf("number")
    })
  })

  describe("getAllJobs", () => {
    it("returns an empty array when no jobs exist", async () => {
      const jobs = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          return yield* svc.getAllJobs
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      expect(jobs).toEqual([])
    })

    it("returns all persisted jobs", async () => {
      const jobs = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          yield* svc.createJob("Job A")
          yield* svc.createJob("Job B")
          yield* svc.createJob("Job C")
          return yield* svc.getAllJobs
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      expect(jobs).toHaveLength(3)
      const titles = jobs.map((j) => j.title)
      expect(titles).toContain("Job A")
      expect(titles).toContain("Job B")
      expect(titles).toContain("Job C")
    })

    it("returns jobs with all required fields", async () => {
      const jobs = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* JobStoreService
          yield* svc.createJob("Check Fields")
          return yield* svc.getAllJobs
        }).pipe(Effect.provide(JobStoreServiceLive)),
      )

      expect(jobs).toHaveLength(1)
      const job = jobs[0]
      expect(job.id).toBeTypeOf("string")
      expect(job.title).toBe("Check Fields")
      expect(job.stage).toBe("UPLOADING")
      expect(job.progress).toBe(0)
      expect(job.startedAt).toBeTypeOf("number")
    })
  })
})
