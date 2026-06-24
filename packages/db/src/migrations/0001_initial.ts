import { Effect } from "effect"
import { SqlClient } from "@effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  const oldConfigExists = yield* sql`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'config'
  `
  const oldWatchesExist = yield* sql`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name = 'watches'
  `

  const oldConfig = oldConfigExists.length > 0
    ? yield* sql<{ key: string; value: string }>`SELECT key, value FROM config`
    : []

  if (oldConfigExists.length > 0) {
    yield* sql`DROP TABLE IF EXISTS config`
  }
  if (oldWatchesExist.length > 0) {
    yield* sql`DROP TABLE IF EXISTS watch_alerts`
    yield* sql`DROP TABLE IF EXISTS watches`
  }
  yield* sql`DROP TABLE IF EXISTS jobs`

  yield* sql`
    CREATE TABLE IF NOT EXISTS prowlarr_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT ''
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS alldebrid_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      api_key TEXT NOT NULL DEFAULT ''
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS kcc_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      docker_image TEXT NOT NULL DEFAULT 'ghcr.io/ciromattia/kcc:latest',
      profile TEXT NOT NULL DEFAULT 'KoBO',
      format TEXT NOT NULL DEFAULT 'Auto',
      manga_style INTEGER NOT NULL DEFAULT 0,
      webtoon INTEGER NOT NULL DEFAULT 0,
      two_panel INTEGER NOT NULL DEFAULT 0,
      upscale INTEGER NOT NULL DEFAULT 1,
      stretch INTEGER NOT NULL DEFAULT 0,
      hq INTEGER NOT NULL DEFAULT 0,
      gamma REAL NOT NULL DEFAULT 1.0,
      cropping TEXT NOT NULL DEFAULT '1',
      cropping_power REAL NOT NULL DEFAULT 1.0,
      force_color INTEGER NOT NULL DEFAULT 1,
      force_png INTEGER NOT NULL DEFAULT 0,
      no_auto_contrast INTEGER NOT NULL DEFAULT 0,
      black_borders INTEGER NOT NULL DEFAULT 0,
      white_borders INTEGER NOT NULL DEFAULT 0,
      splitter TEXT NOT NULL DEFAULT '0',
      no_processing INTEGER NOT NULL DEFAULT 0,
      erase_rainbow INTEGER NOT NULL DEFAULT 1,
      cover_fill INTEGER NOT NULL DEFAULT 0,
      batch_split TEXT NOT NULL DEFAULT '0',
      target_size INTEGER NOT NULL DEFAULT 0,
      custom_width INTEGER NOT NULL DEFAULT 0,
      custom_height INTEGER NOT NULL DEFAULT 0,
      no_kepub INTEGER NOT NULL DEFAULT 0
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS copyparty_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      url TEXT NOT NULL DEFAULT '',
      upload_path TEXT NOT NULL DEFAULT '/',
      password TEXT NOT NULL DEFAULT ''
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS komga_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      default_library_id TEXT NOT NULL DEFAULT ''
    )
  `

  yield* sql`
    CREATE TABLE IF NOT EXISTS watches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      query TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL,
      filter_groups TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS watch_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watch_id INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
      guid TEXT NOT NULL,
      title TEXT NOT NULL,
      magnet_url TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      seeders INTEGER NOT NULL DEFAULT 0,
      indexer TEXT NOT NULL DEFAULT '',
      matched_at INTEGER NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      UNIQUE(watch_id, guid)
    )
  `
  yield* sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'UPLOADING',
      progress INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `

  yield* sql`INSERT OR IGNORE INTO prowlarr_config (id) VALUES (1)`
  yield* sql`INSERT OR IGNORE INTO alldebrid_config (id) VALUES (1)`
  yield* sql`INSERT OR IGNORE INTO kcc_config (id) VALUES (1)`
  yield* sql`INSERT OR IGNORE INTO copyparty_config (id) VALUES (1)`
  yield* sql`INSERT OR IGNORE INTO komga_config (id) VALUES (1)`

  if (oldConfig.length > 0) {
    for (const row of oldConfig) {
      let parsed: unknown
      try { parsed = JSON.parse(row.value) } catch { continue }
      if (typeof parsed !== "object" || parsed === null) continue
      const obj = parsed as Record<string, unknown>
      switch (row.key) {
        case "prowlarr":
          yield* sql`UPDATE prowlarr_config SET url = ${String(obj.url ?? "")}, api_key = ${String(obj.apiKey ?? "")} WHERE id = 1`
          break
        case "alldebrid":
          yield* sql`UPDATE alldebrid_config SET api_key = ${String(obj.apiKey ?? "")} WHERE id = 1`
          break
        case "kcc":
          yield* sql`UPDATE kcc_config SET
            docker_image = ${String(obj.dockerImage ?? "ghcr.io/ciromattia/kcc:latest")},
            profile = ${String(obj.profile ?? "KoBO")},
            format = ${String(obj.format ?? "Auto")},
            manga_style = ${obj.mangaStyle ? 1 : 0},
            webtoon = ${obj.webtoon ? 1 : 0},
            two_panel = ${obj.twoPanel ? 1 : 0},
            upscale = ${obj.upscale !== false ? 1 : 0},
            stretch = ${obj.stretch ? 1 : 0},
            hq = ${obj.hq ? 1 : 0},
            gamma = ${Number(obj.gamma ?? 1.0)},
            cropping = ${String(obj.cropping ?? "1")},
            cropping_power = ${Number(obj.croppingPower ?? 1.0)},
            force_color = ${obj.forceColor !== false ? 1 : 0},
            force_png = ${obj.forcePng ? 1 : 0},
            no_auto_contrast = ${obj.noAutoContrast ? 1 : 0},
            black_borders = ${obj.blackBorders ? 1 : 0},
            white_borders = ${obj.whiteBorders ? 1 : 0},
            splitter = ${String(obj.splitter ?? "0")},
            no_processing = ${obj.noProcessing ? 1 : 0},
            erase_rainbow = ${obj.eraseRainbow !== false ? 1 : 0},
            cover_fill = ${obj.coverFill ? 1 : 0},
            batch_split = ${String(obj.batchSplit ?? "0")},
            target_size = ${Number(obj.targetSize ?? 0)},
            custom_width = ${Number(obj.customWidth ?? 0)},
            custom_height = ${Number(obj.customHeight ?? 0)},
            no_kepub = ${obj.noKepub ? 1 : 0}
            WHERE id = 1`
          break
        case "copyparty":
          yield* sql`UPDATE copyparty_config SET url = ${String(obj.url ?? "")}, upload_path = ${String(obj.uploadPath ?? "/")}, password = ${String(obj.password ?? "")} WHERE id = 1`
          break
        case "komga":
          yield* sql`UPDATE komga_config SET url = ${String(obj.url ?? "")}, api_key = ${String(obj.apiKey ?? "")}, default_library_id = ${String(obj.defaultLibraryId ?? "")} WHERE id = 1`
          break
      }
    }
  }
})
