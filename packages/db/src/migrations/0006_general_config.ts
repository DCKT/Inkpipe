import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE IF NOT EXISTS general_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      public_url TEXT NOT NULL DEFAULT ''
    )
  `

  yield* sql`INSERT OR IGNORE INTO general_config (id) VALUES (1)`
})
