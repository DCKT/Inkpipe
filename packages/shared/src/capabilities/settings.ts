import { defineContract } from "@inkpipe/capability/contract"
import { Schema } from "effect"
import { SettingsResponseSchema } from "../api"
import { AppConfigSchema } from "../schemas"
import { ConfigLoadErrorS, ConfigSaveErrorS } from "../httpApi/errors"

export const SuccessFlagSchema = Schema.Struct({ success: Schema.Boolean })

export const getSettingsContract = defineContract("getSettings", {
  description: "Read the application configuration",
  annotations: { readOnly: true, idempotent: true },
  http: { method: "GET", path: "/api/settings" },
  input: Schema.Struct({}),
  output: SettingsResponseSchema,
  failure: ConfigLoadErrorS,
})

export const updateSettingsContract = defineContract("updateSettings", {
  description: "Replace the application configuration",
  annotations: { idempotent: true },
  http: { method: "POST", path: "/api/settings" },
  input: AppConfigSchema,
  output: SuccessFlagSchema,
  failure: ConfigSaveErrorS,
})

export const settingsContracts = [getSettingsContract, updateSettingsContract] as const
