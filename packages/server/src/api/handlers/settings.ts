import { Effect, Schema } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpServerResponse } from "effect/unstable/http"
import { AppConfigSchema, SettingsImportError } from "@inkpipe/shared"
import type { AppConfig } from "@inkpipe/shared"
import { ConfigService } from "../../layers/core/Config"
import { InkpipeApi } from "@inkpipe/shared"

export const SettingsGroupLive = HttpApiBuilder.group(InkpipeApi, "settings", (handlers) =>
  handlers
    .handle("get", () =>
      Effect.gen(function* () {
        const configService = yield* ConfigService
        return yield* configService.loadConfig
      }))
    .handle("update", ({ payload }) =>
      Effect.gen(function* () {
        const configService = yield* ConfigService
        yield* configService.saveConfig(payload as AppConfig)
        return { success: true }
      }))
    .handle("export", () =>
      Effect.gen(function* () {
        const configService = yield* ConfigService
        const config = yield* configService.loadConfig
        const today = new Date().toISOString().slice(0, 10)
        return HttpServerResponse.text(JSON.stringify(config, null, 2), {
          contentType: "application/json",
          headers: {
            "Content-Disposition": `attachment; filename="inkpipe-settings-${today}.json"`,
          },
        })
      }))
    .handle("import", ({ payload }) =>
      Effect.gen(function* () {
        const config = yield* Schema.decodeUnknownEffect(AppConfigSchema)(payload as unknown).pipe(
          Effect.mapError((e) =>
            new SettingsImportError({ message: `Invalid settings format: ${String(e)}` }),
          ),
        )
        const configService = yield* ConfigService
        yield* configService.saveConfig(config)
        return { success: true }
      })),
)
