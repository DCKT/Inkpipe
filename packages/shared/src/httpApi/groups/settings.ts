import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { SettingsResponseSchema } from "../../api"
import { SuccessFlagSchema } from "../../capabilities/settings"
import { ConfigLoadErrorS, ConfigSaveErrorS, SettingsImportErrorS } from "../errors"

// get/update are capabilities (see ../../capabilities/settings). These two stay hand-written:
// export answers with a file download and import takes an untyped JSON body.
export const SettingsGroup = HttpApiGroup.make("settings")
  .add(
    // Returns a file-download response (Content-Disposition header) built
    // manually in the handler; the success schema below documents the shape.
    HttpApiEndpoint.get("export", "/api/settings/export", {
      success: SettingsResponseSchema,
      error: [ConfigLoadErrorS],
    }),
  )
  .add(
    HttpApiEndpoint.post("import", "/api/settings/import", {
      payload: Schema.Unknown,
      success: SuccessFlagSchema,
      error: [SettingsImportErrorS, ConfigSaveErrorS],
    }),
  )
