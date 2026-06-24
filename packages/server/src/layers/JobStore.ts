import { Effect, Layer, Option } from "effect"
import { SqlClient } from "@effect/sql"
import type { Job, JobStage } from "@inkpipe/shared"
import { JobId } from "@inkpipe/shared"

export class JobStoreService extends Effect.Tag("JobStoreService")<
  JobStoreService,
  {
    readonly createJob: (title: string) => Effect.Effect<Job>
    readonly updateJob: (id: JobId, update: Partial<Omit<Job, "id">>) => Effect.Effect<void>
    readonly getJob: (id: JobId) => Effect.Effect<Option.Option<Job>>
    readonly getAllJobs: Effect.Effect<Job[]>
    readonly deleteCompletedJobs: Effect.Effect<number>
  }
>() {}

interface JobRow {
  id: number
  title: string
  stage: string
  progress: number
  error: string | null
  startedAt: number
  createdAt: string
  updatedAt: string
}

function toJob(row: JobRow): Job {
  return {
    id: JobId.make(row.id),
    title: row.title,
    stage: row.stage as JobStage,
    progress: row.progress,
    error: row.error ?? undefined,
    startedAt: row.startedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export const JobStoreServiceLive = Layer.effect(
  JobStoreService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const createJob = (title: string): Effect.Effect<Job> =>
      Effect.gen(function* () {
        const rows = yield* sql<JobRow>`INSERT INTO jobs ${sql.insert({
          title,
          stage: "UPLOADING",
          progress: 0,
          startedAt: Date.now(),
        }).returning("*")}`
        return toJob(rows[0])
      }).pipe(Effect.orDie)

    const updateJob = (id: JobId, update: Partial<Omit<Job, "id">>): Effect.Effect<void> =>
      Effect.gen(function* () {
        const dbUpdate: Record<string, unknown> = {}
        if (update.stage !== undefined) dbUpdate.stage = update.stage
        if (update.progress !== undefined) dbUpdate.progress = update.progress
        if (update.error !== undefined) dbUpdate.error = update.error
        if (update.startedAt !== undefined) dbUpdate.startedAt = update.startedAt
        if (Object.keys(dbUpdate).length > 0) {
          yield* sql`UPDATE jobs SET ${sql.update(dbUpdate, ["id"])} WHERE id = ${id}`
        }
      }).pipe(Effect.orDie)

    const getJob = (id: JobId): Effect.Effect<Option.Option<Job>> =>
      Effect.gen(function* () {
        const rows = yield* sql<JobRow>`SELECT * FROM jobs WHERE id = ${id}`
        if (rows.length === 0) return Option.none<Job>()
        return Option.some(toJob(rows[0]))
      }).pipe(Effect.orDie)

    const getAllJobs: Effect.Effect<Job[]> = Effect.gen(function* () {
      const rows = yield* sql<JobRow>`SELECT * FROM jobs ORDER BY started_at DESC`
      return rows.map(toJob)
    }).pipe(Effect.orDie)

    const deleteCompletedJobs: Effect.Effect<number> = Effect.gen(function* () {
      const [countRow] = yield* sql<{ count: number }>`SELECT COUNT(*) as count FROM jobs WHERE stage = 'DONE' OR stage = 'FAILED'`
      const count = countRow?.count ?? 0
      if (count > 0) {
        yield* sql`DELETE FROM jobs WHERE stage = 'DONE' OR stage = 'FAILED'`
      }
      return count
    }).pipe(Effect.orDie)

    return { createJob, updateJob, getJob, getAllJobs, deleteCompletedJobs }
  }),
)
