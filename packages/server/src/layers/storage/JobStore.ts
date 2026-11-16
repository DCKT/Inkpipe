import { Context, Effect, Layer, Option } from "effect"
import { SqlClient } from "effect/sql"
import type { Job, JobStage } from "@inkpipe/shared"
import { JobId } from "@inkpipe/shared"
import { publishJobEvent } from "../../lib/jobEvents"

export class JobStoreService extends Context.Service<
  JobStoreService,
  {
    readonly createJob: (title: string) => Effect.Effect<Job>
    readonly updateJob: (id: JobId, update: Partial<Omit<Job, "id">>) => Effect.Effect<void>
    readonly getJob: (id: JobId) => Effect.Effect<Option.Option<Job>>
    readonly getAllJobs: Effect.Effect<Job[]>
    readonly deleteCompletedJobs: Effect.Effect<number>
    /**
     * Force-removes jobs still in an active stage. Escape hatch for jobs left
     * stuck mid-pipeline when the server crashed and never marked them done.
     */
    readonly deleteActiveJobs: Effect.Effect<number>
    /**
     * Marks every job still in an active stage as FAILED with `reason`.
     * Returns how many were marked.
     */
    readonly failActiveJobs: (reason: string) => Effect.Effect<number>
  }
>()("JobStoreService") {}

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
        const rows = yield* sql<JobRow>`INSERT INTO jobs ${sql
          .insert({
            title,
            stage: "UPLOADING",
            progress: 0,
            startedAt: Date.now(),
          })
          .returning("*")}`
        const job = toJob(rows[0])
        publishJobEvent(job)
        return job
      }).pipe(Effect.orDie)

    const updateJob = (id: JobId, update: Partial<Omit<Job, "id">>): Effect.Effect<void> =>
      Effect.gen(function* () {
        const dbUpdate: Record<string, unknown> = {}
        if (update.stage !== undefined) dbUpdate.stage = update.stage
        if (update.progress !== undefined) dbUpdate.progress = update.progress
        if (update.error !== undefined) dbUpdate.error = update.error
        if (update.startedAt !== undefined) dbUpdate.startedAt = update.startedAt
        if (Object.keys(dbUpdate).length > 0) {
          const rows =
            yield* sql<JobRow>`UPDATE jobs SET ${sql.update(dbUpdate, ["id"])} WHERE id = ${id} RETURNING *`
          if (rows.length > 0) publishJobEvent(toJob(rows[0]))
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
      const [countRow] = yield* sql<{
        count: number
      }>`SELECT COUNT(*) as count FROM jobs WHERE stage = 'DONE' OR stage = 'FAILED'`
      const count = countRow?.count ?? 0
      if (count > 0) {
        yield* sql`DELETE FROM jobs WHERE stage = 'DONE' OR stage = 'FAILED'`
      }
      return count
    }).pipe(Effect.orDie)

    const deleteActiveJobs: Effect.Effect<number> = Effect.gen(function* () {
      const rows = yield* sql<{
        id: number
      }>`DELETE FROM jobs WHERE stage <> 'DONE' AND stage <> 'FAILED' RETURNING id`
      return rows.length
    }).pipe(Effect.orDie)

    const failActiveJobs = (reason: string): Effect.Effect<number> =>
      Effect.gen(function* () {
        const rows = yield* sql<JobRow>`UPDATE jobs
          SET stage = 'FAILED', error = ${reason}, updated_at = datetime('now')
          WHERE stage <> 'DONE' AND stage <> 'FAILED'
          RETURNING *`
        for (const row of rows) publishJobEvent(toJob(row))
        return rows.length
      }).pipe(Effect.orDie)

    return {
      createJob,
      updateJob,
      getJob,
      getAllJobs,
      deleteCompletedJobs,
      deleteActiveJobs,
      failActiveJobs,
    }
  }),
)

export const INTERRUPTED_JOB_ERROR = "Interrupted by a server restart"

/**
 * Pipelines run in the server process, so a job still in an active stage when
 * the server starts can never progress: its fiber died with the previous
 * process. Mark those jobs FAILED so they land in Completed and can be cleaned.
 * Built before the HTTP server starts, so clients never see the stale stages.
 */
export const FailInterruptedJobsOnStartupLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const jobStore = yield* JobStoreService
    const count = yield* jobStore.failActiveJobs(INTERRUPTED_JOB_ERROR)
    if (count > 0) yield* Effect.logWarning(`Marked ${count} interrupted job(s) as FAILED`)
  }),
)
