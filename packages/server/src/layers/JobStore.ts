import { Effect, Layer, Option } from "effect"
import { Database } from "bun:sqlite"
import { join } from "node:path"
import { homedir } from "node:os"
import { mkdirSync } from "node:fs"
import { type Job, type JobStage } from "@inkpipe/shared"

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

const CONFIG_DIR = join(homedir(), ".inkpipe")
const DB_PATH = join(CONFIG_DIR, "inkpipe.db")

function getDb(): Database {
  mkdirSync(CONFIG_DIR, { recursive: true })
  const db = new Database(DB_PATH, { create: true })
  db.run("PRAGMA journal_mode=WAL")
  db.run(
    `CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'UPLOADING',
      progress INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      startedAt INTEGER NOT NULL
    )`,
  )
  return db
}

let nextId = 1

export const JobStoreServiceLive = Layer.effect(
  JobStoreService,
  Effect.gen(function* () {
    const db = yield* Effect.sync(() => getDb())

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
