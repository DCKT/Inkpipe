import * as Rpc from "@effect/rpc/Rpc"
import * as RpcGroup from "@effect/rpc/RpcGroup"
import { AppConfigSchema } from "../schemas"
import { ConfigLoadError, ConfigSaveError } from "../errors"

export const GetSettings = Rpc.make("settings.get", {
  success: AppConfigSchema,
  error: ConfigLoadError,
})

export const UpdateSettings = Rpc.make("settings.update", {
  payload: { config: AppConfigSchema },
  error: ConfigSaveError,
})

export const ExportSettings = Rpc.make("settings.export", {
  success: AppConfigSchema,
  error: ConfigLoadError,
})

export const ImportSettings = Rpc.make("settings.import", {
  payload: { config: AppConfigSchema },
  error: ConfigSaveError,
})

export const SettingsRpcGroup = RpcGroup.make(
  GetSettings,
  UpdateSettings,
  ExportSettings,
  ImportSettings,
)
