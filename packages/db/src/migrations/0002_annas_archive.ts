import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE IF NOT EXISTS annas_archive_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      api_key TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT 'https://annas-archive.gl'
    )
  `

  yield* sql`INSERT OR IGNORE INTO annas_archive_config (id) VALUES (1)`
})
