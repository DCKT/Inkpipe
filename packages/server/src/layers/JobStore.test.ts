import { Effect, Option } from "effect"
import { describe, it, expect, beforeEach } from "vitest"
import { DbService } from "@inkpipe/db"
import { createMockDb, resetMockDb } from "../test/db"
import { JobStoreService, JobStoreServiceLive } from "./JobStore"

beforeEach(() => {
  resetMockDb()
})

describe("JobStoreService", () => {
  describe("createJob", () => {
    it("creates a job with correct initial fields", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        return yield* svc.createJob("My Title")
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const job: any = await Effect.runPromise(program as any)

      expect(job.id).toBeTypeOf("string")
      expect(job.title).toBe("My Title")
      expect(job.stage).toBe("UPLOADING")
      expect(job.progress).toBe(0)
      expect(job.startedAt).toBeGreaterThan(0)
      expect(job.error).toBeUndefined()
    })

    it("persists the job and can be retrieved", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        const created = yield* svc.createJob("Persisted Job")
        const retrieved = yield* svc.getJob(created.id)
        return { created, retrieved }
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const job: any = await Effect.runPromise(program as any)

      expect((Option.getOrNull(job.retrieved) as any).title).toBe("Persisted Job")
    })

    it("assigns incrementing string IDs", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        const j1 = yield* svc.createJob("First")
        const j2 = yield* svc.createJob("Second")
        const j3 = yield* svc.createJob("Third")
        return [j1, j2, j3] as const
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const jobs: any = await Effect.runPromise(program as any)

      expect(Number(jobs[0].id)).toBeLessThan(Number(jobs[1].id))
      expect(Number(jobs[1].id)).toBeLessThan(Number(jobs[2].id))
    })
  })

  describe("updateJob", () => {
    it("updates the stage", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        const job = yield* svc.createJob("Update Test")
        yield* svc.updateJob(job.id, { stage: "DOWNLOADING" })
        return yield* svc.getJob(job.id)
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      expect((Option.getOrNull(result) as any).stage).toBe("DOWNLOADING")
    })

    it("updates the progress", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        const job = yield* svc.createJob("Progress Test")
        yield* svc.updateJob(job.id, { progress: 75 })
        return yield* svc.getJob(job.id)
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      expect((Option.getOrNull(result) as any).progress).toBe(75)
    })

    it("updates the error field", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        const job = yield* svc.createJob("Error Test")
        yield* svc.updateJob(job.id, { error: "Something went wrong" })
        return yield* svc.getJob(job.id)
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      expect((Option.getOrNull(result) as any).error).toBe("Something went wrong")
    })

    it("updates multiple fields at once", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        const job = yield* svc.createJob("Multi Update")
        yield* svc.updateJob(job.id, {
          stage: "CONVERTING",
          progress: 50,
          error: "partial",
        })
        return yield* svc.getJob(job.id)
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      const j = Option.getOrNull(result) as any
      expect(j.stage).toBe("CONVERTING")
      expect(j.progress).toBe(50)
      expect(j.error).toBe("partial")
    })

    it("does not throw when updating with empty fields", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        const job = yield* svc.createJob("Empty Update")
        yield* svc.updateJob(job.id, {})
        const retrieved = yield* svc.getJob(job.id)
        expect((Option.getOrNull(retrieved) as any).stage).toBe("UPLOADING")
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      await Effect.runPromise(program as any)
    })

    it("does not throw when updating non-existent job", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        yield* svc.updateJob("nonexistent", { stage: "DONE" })
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      await Effect.runPromise(program as any)
    })
  })

  describe("getJob", () => {
    it("returns Option.none for non-existent job", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        return yield* svc.getJob("does-not-exist")
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      expect(Option.isNone(result)).toBe(true)
    })

    it("returns Option.some for existing job", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        const job = yield* svc.createJob("Find Me")
        return yield* svc.getJob(job.id)
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      expect(Option.isSome(result)).toBe(true)
      expect((Option.getOrNull(result) as any).title).toBe("Find Me")
    })

    it("getJob returns the job with all fields intact", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        const job = yield* svc.createJob("Full Fields")
        return yield* svc.getJob(job.id)
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      const j = Option.getOrNull(result) as any
      expect(j.id).toBeTypeOf("string")
      expect(j.title).toBe("Full Fields")
      expect(j.stage).toBe("UPLOADING")
      expect(j.progress).toBe(0)
      expect(j.startedAt).toBeTypeOf("number")
    })
  })

  describe("getAllJobs", () => {
    it("returns an empty array when no jobs exist", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        return yield* svc.getAllJobs
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const jobs: any = await Effect.runPromise(program as any)

      expect(jobs).toEqual([])
    })

    it("returns all persisted jobs", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        yield* svc.createJob("Job A")
        yield* svc.createJob("Job B")
        yield* svc.createJob("Job C")
        return yield* svc.getAllJobs
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const jobs: any = await Effect.runPromise(program as any)

      expect(jobs).toHaveLength(3)
      const titles = jobs.map((j: any) => j.title)
      expect(titles).toContain("Job A")
      expect(titles).toContain("Job B")
      expect(titles).toContain("Job C")
    })

    it("returns jobs with all required fields", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* JobStoreService
        yield* svc.createJob("Check Fields")
        return yield* svc.getAllJobs
      }).pipe(Effect.provide(JobStoreServiceLive), Effect.provideService(DbService, { db }))

      const jobs: any = await Effect.runPromise(program as any)

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
