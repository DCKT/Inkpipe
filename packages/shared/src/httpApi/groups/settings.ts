import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { AppConfigSchema } from "../../schemas"
import { SettingsResponseSchema } from "../../api"
import { ConfigLoadErrorS, ConfigSaveErrorS, SettingsImportErrorS } from "../errors"

export const SuccessFlagSchema = Schema.Struct({ success: Schema.Boolean })

export const SettingsGroup = HttpApiGroup.make("settings").add(
  HttpApiEndpoint.get("get", "/api/settings", {
    success: SettingsResponseSchema,
    error: [ConfigLoadErrorS],
  }),
).add(
  HttpApiEndpoint.post("update", "/api/settings", {
    payload: AppConfigSchema,
    success: SuccessFlagSchema,
    error: [ConfigSaveErrorS],
  }),
).add(
  // Returns a file-download response (Content-Disposition header) built
  // manually in the handler; the success schema below documents the shape.
  HttpApiEndpoint.get("export", "/api/settings/export", {
    success: SettingsResponseSchema,
    error: [ConfigLoadErrorS],
  }),
).add(
  HttpApiEndpoint.post("import", "/api/settings/import", {
    payload: Schema.Unknown,
    success: SuccessFlagSchema,
    error: [SettingsImportErrorS, ConfigSaveErrorS],
  }),
)
