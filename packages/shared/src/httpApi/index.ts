import { HttpApi } from "effect/http-api"
import { SettingsGroup } from "./groups/settings"
import { ConvertGroup } from "./groups/convert"
import { SchemaErrorMiddleware } from "./middleware"

export const InkpipeApi = HttpApi.make("InkpipeApi")
  .add(SettingsGroup)
  .add(ConvertGroup)
  .middleware(SchemaErrorMiddleware)
