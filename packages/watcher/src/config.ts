import type { ProwlarrConfig } from "@inkpipe/shared"
import type { Database } from "bun:sqlite"

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
