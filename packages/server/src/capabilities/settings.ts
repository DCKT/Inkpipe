import { implement } from "@inkpipe/capability/implement"
import { getSettingsContract, updateSettingsContract } from "@inkpipe/shared"
import { Effect } from "effect"
import { ConfigService } from "../layers/core/Config"

export const getSettings = implement(getSettingsContract, () =>
  ConfigService.use((config) => config.loadConfig),
)

export const updateSettings = implement(updateSettingsContract, (config) =>
  ConfigService.use((configService) => configService.saveConfig(config)).pipe(
    Effect.as({ success: true }),
  ),
)

export const settingsCapabilities = [getSettings, updateSettings] as const
