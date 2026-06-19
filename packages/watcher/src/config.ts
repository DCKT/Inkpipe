import { Database } from "bun:sqlite"
import { join } from "node:path"
import { homedir } from "node:os"
import { mkdirSync } from "node:fs"
import type { ProwlarrConfig } from "@inkpipe/shared"

const CONFIG_DIR = join(homedir(), ".inkpipe")
const DB_PATH = join(CONFIG_DIR, "inkpipe.db")

export function getDb(): Database {
  mkdirSync(CONFIG_DIR, { recursive: true })
  const db = new Database(DB_PATH, { create: true })
  db.run("PRAGMA journal_mode=WAL")
  db.run(
    "CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)",
  )
  db.run(
    `CREATE TABLE IF NOT EXISTS watches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      query TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL,
      filter_groups TEXT NOT NULL
    )`,
  )
  db.run(
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

export function loadProwlarrConfig(db: Database): ProwlarrConfig | null {
  const raw = db.query("SELECT value FROM config WHERE key = 'prowlarr'").get() as
    | { value: string }
    | undefined
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw.value) as ProwlarrConfig
    if (!parsed.url || !parsed.apiKey) return null
    return parsed
  } catch {
    return null
  }
}
