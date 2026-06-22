import { Effect } from "effect"
import type { AppConfig } from "@inkpipe/shared"
import { SettingsRpcGroup } from "@inkpipe/shared/rpc"
import { ConfigService } from "../../layers/Config"

export const SettingsHandlersLive = SettingsRpcGroup.toLayer({
  "settings.get": () =>
    Effect.gen(function* () {
      const configService = yield* ConfigService
      return yield* configService.loadConfig
    }),
  "settings.update": (payload: { readonly config: AppConfig }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigService
      yield* configService.saveConfig(payload.config)
    }),
  "settings.export": () =>
    Effect.gen(function* () {
      const configService = yield* ConfigService
      return yield* configService.loadConfig
    }),
  "settings.import": (payload: { readonly config: AppConfig }) =>
    Effect.gen(function* () {
      const configService = yield* ConfigService
      yield* configService.saveConfig(payload.config)
    }),
})
