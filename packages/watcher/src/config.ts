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
