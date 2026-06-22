import { Schema } from "effect"
import { ConfigLoadError, ConfigSaveError } from "../errors"

export const SettingsErrors = Schema.Union(ConfigLoadError, ConfigSaveError)
