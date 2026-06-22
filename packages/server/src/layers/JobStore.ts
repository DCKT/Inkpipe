import { Effect, Layer, Option } from "effect"
import { type Job, type JobStage } from "@inkpipe/shared"
import { DbService } from "@inkpipe/db"

export class JobStoreService extends Effect.Tag("JobStoreService")<
  JobStoreService,
  {
    readonly createJob: (title: string) => Effect.Effect<Job>
    readonly updateJob: (id: string, update: Partial<Omit<Job, "id">>) => Effect.Effect<void>
    readonly getJob: (id: string) => Effect.Effect<Option.Option<Job>>
    readonly getAllJobs: Effect.Effect<Job[]>
    readonly deleteCompletedJobs: Effect.Effect<number>
  }
>() {}

let nextId = 1

export const JobStoreServiceLive = Layer.effect(
  JobStoreService,
  Effect.gen(function* () {
    const { db } = yield* DbService

    const createJob = (title: string) =>
      Effect.gen(function* () {
        return yield* Effect.sync(() => {
          const id = String(nextId++)
          const job: Job = {
            id,
            title,
            stage: "UPLOADING" as JobStage,
            progress: 0,
            startedAt: Date.now(),
          }
          const stmt = db.prepare(
            "INSERT INTO jobs (id, title, stage, progress, startedAt) VALUES (?, ?, ?, ?, ?)",
          )
          stmt.run(job.id, job.title, job.stage, job.progress, job.startedAt)
          return job
        })
      })

    const updateJob = (id: string, update: Partial<Omit<Job, "id">>) =>
      Effect.sync(() => {
        const sets: string[] = []
        const params: unknown[] = []
        if (update.stage !== undefined) {
          sets.push("stage = ?")
          params.push(update.stage)
        }
        if (update.progress !== undefined) {
          sets.push("progress = ?")
          params.push(update.progress)
        }
        if (update.error !== undefined) {
          sets.push("error = ?")
          params.push(update.error)
        }
        if (sets.length > 0) {
          const stmt = db.prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`)
          params.push(id)
          stmt.run(...params as any)
        }
      })

    const getJob = (id: string) =>
      Effect.sync(() => {
        const row = db.query("SELECT * FROM jobs WHERE id = ?").get(id) as
          | Record<string, unknown>
          | undefined
        if (!row) return Option.none<Job>()
        return Option.some({
          id: String(row.id),
          title: String(row.title),
          stage: String(row.stage) as JobStage,
          progress: Number(row.progress),
          error: row.error ? String(row.error) : undefined,
          startedAt: Number(row.startedAt),
        })
      })

    const getAllJobs = Effect.sync(() => {
      const rows = db
        .query("SELECT * FROM jobs ORDER BY startedAt DESC")
        .all() as Record<string, unknown>[]
      return rows.map(
        (row): Job => ({
          id: String(row.id),
          title: String(row.title),
          stage: String(row.stage) as JobStage,
          progress: Number(row.progress),
          error: row.error ? String(row.error) : undefined,
          startedAt: Number(row.startedAt),
        }),
      )
    })

    const deleteCompletedJobs = Effect.sync(() => {
      const stmt = db.prepare("DELETE FROM jobs WHERE stage = ? OR stage = ?")
      return stmt.run("DONE", "FAILED").changes
    })

    return { createJob, updateJob, getJob, getAllJobs, deleteCompletedJobs }
  }),
)
