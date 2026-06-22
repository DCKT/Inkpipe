import { Effect, Layer, Schema } from "effect"
import {
  AppConfigSchema,
  type AppConfig,
  ConfigLoadError,
  ConfigSaveError,
} from "@inkpipe/shared"
import { DbService } from "@inkpipe/db"

export class ConfigService extends Effect.Tag("ConfigService")<
  ConfigService,
  {
    readonly loadConfig: Effect.Effect<AppConfig, ConfigLoadError>
    readonly saveConfig: (config: AppConfig) => Effect.Effect<void, ConfigSaveError>
  }
>() {}

export const ConfigServiceLive = Layer.effect(
  ConfigService,
  Effect.gen(function* () {
    const { db } = yield* DbService

    const loadConfig = Effect.gen(function* () {
      return yield* Effect.try({
        try: () => {
          const rows = db.query("SELECT key, value FROM config").all() as {
            key: string
            value: string
          }[]
          const raw: Record<string, unknown> = {}
          for (const row of rows) {
            try {
              raw[row.key] = JSON.parse(row.value)
            } catch {
              raw[row.key] = row.value
            }
          }
          return Schema.decodeUnknownSync(AppConfigSchema)(raw)
        },
        catch: (e) =>
          new ConfigLoadError({
            message: `Failed to load config: ${e instanceof Error ? e.message : String(e)}`,
          }),
      })
    })

    const saveConfig = (config: AppConfig) =>
      Effect.gen(function* () {
        yield* Effect.try({
          try: () => {
            const insert = db.prepare(
              "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
            )
            const sections = ["prowlarr", "alldebrid", "kcc", "copyparty", "komga"]
            const runAll = db.transaction(() => {
              for (const section of sections) {
                const value = (config as Record<string, unknown>)[section]
                insert.run(section, JSON.stringify(value))
              }
            })
            runAll()
          },
          catch: (e) =>
            new ConfigSaveError({
              message: `Failed to save config: ${e instanceof Error ? e.message : String(e)}`,
            }),
        })
      })

    return { loadConfig, saveConfig }
  }),
)
