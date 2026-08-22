import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`
    CREATE TABLE IF NOT EXISTS telegram_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      bot_token TEXT NOT NULL DEFAULT '',
      chat_id TEXT NOT NULL DEFAULT ''
    )
  `

  yield* sql`INSERT OR IGNORE INTO telegram_config (id) VALUES (1)`
})
