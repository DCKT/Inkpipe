import { Effect, Schema } from "effect"
import type { AppConfig } from "@inkpipe/shared"
import { AppConfigSchema } from "@inkpipe/shared"
import { ConfigService } from "../layers/Config"

export const getSettingsHandler = Effect.gen(function* () {
  const configService = yield* ConfigService
  const config = yield* configService.loadConfig
  return Response.json(config satisfies AppConfig)
}).pipe(
  Effect.catchAll((e: { message: string }) =>
    Effect.succeed(
      Response.json({ error: e.message }, { status: 500 }),
    ),
  ),
)

export const updateSettingsHandler = (body: AppConfig) =>
  Effect.gen(function* () {
    const configService = yield* ConfigService
    yield* configService.saveConfig(body)
    return Response.json({ success: true })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 500 }),
      ),
    ),
  )

export const exportSettingsHandler = Effect.gen(function* () {
  const configService = yield* ConfigService
  const config = yield* configService.loadConfig
  const today = new Date().toISOString().slice(0, 10)
  return new Response(JSON.stringify(config, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="inkpipe-settings-${today}.json"`,
    },
  })
}).pipe(
  Effect.catchAll((e: { message: string }) =>
    Effect.succeed(
      Response.json({ error: e.message }, { status: 500 }),
    ),
  ),
)

export const importSettingsHandler = (body: unknown) =>
  Effect.gen(function* () {
    const config = yield* Effect.try({
      try: () => Schema.decodeUnknownSync(AppConfigSchema)(body),
      catch: (e) =>
        new Error(
          `Invalid settings format: ${e instanceof Error ? e.message : String(e)}`,
        ),
    })
    const configService = yield* ConfigService
    yield* configService.saveConfig(config)
    return Response.json({ success: true })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 422 }),
      ),
    ),
  )
