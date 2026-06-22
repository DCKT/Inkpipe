import { Effect, Layer } from "effect"
import { Database } from "bun:sqlite"
import { join } from "node:path"
import { homedir } from "node:os"
import { mkdirSync } from "node:fs"

const CONFIG_DIR = join(homedir(), ".inkpipe")
const DB_PATH = join(CONFIG_DIR, "inkpipe.db")

let _db: Database | null = null

export function getDb(): Database {
  if (_db) return _db
  mkdirSync(CONFIG_DIR, { recursive: true })
  _db = new Database(DB_PATH, { create: true })
  _db.run("PRAGMA journal_mode=WAL")
  _db.run(
    "CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)",
  )
  _db.run(
    `CREATE TABLE IF NOT EXISTS watches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      query TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL,
      filter_groups TEXT NOT NULL
    )`,
  )
  _db.run(
    `CREATE TABLE IF NOT EXISTS watch_alerts (
      id TEXT PRIMARY KEY,
      watch_id TEXT NOT NULL,
      guid TEXT NOT NULL,
      title TEXT NOT NULL,
      magnet_url TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      seeders INTEGER NOT NULL DEFAULT 0,
      indexer TEXT NOT NULL DEFAULT '',
      matched_at INTEGER NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      UNIQUE(watch_id, guid)
    )`,
  )
  _db.run(
    `CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'UPLOADING',
      progress INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      startedAt INTEGER NOT NULL
    )`,
  )
  return _db
}

export class DbService extends Effect.Tag("DbService")<DbService, { readonly db: Database }>() {}

export const DbServiceLive = Layer.effect(DbService, Effect.sync(() => ({ db: getDb() })))
