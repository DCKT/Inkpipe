// Test-only fixtures for the settings page.
import { type AppConfig, AppConfigSchema } from "@inkpipe/shared"
import { Option, Schema } from "effect"

import * as Settings from "./settings"
import { writeSettingsText } from "./settingsFields"

const decodeConfig = Schema.decodeUnknownOption(AppConfigSchema)

export const defaultConfig: AppConfig = Option.getOrThrowWith(
  decodeConfig({}),
  () => new globalThis.Error("defaults must decode"),
)

export const configWithKomga: AppConfig = writeSettingsText["komga.apiKey"](
  writeSettingsText["komga.url"](defaultConfig, "https://komga.test"),
  "key",
)

/** A page that has finished loading `config`. */
export const loaded = (config: AppConfig = defaultConfig): Settings.Model =>
  Settings.update(Settings.enter(false).model, Settings.Message.SucceededFetchSettings({ config }))
    .model
