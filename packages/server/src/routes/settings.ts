import { Effect } from "effect"
import type { AppConfig } from "@inkpipe/shared"
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
