import * as RpcGroup from "@effect/rpc/RpcGroup"
import { SettingsRpcGroup } from "./settings"
import { HealthRpcGroup } from "./health"

export const AppRpcGroup = RpcGroup.make().merge(SettingsRpcGroup).merge(HealthRpcGroup)

export type AppRpcGroup = typeof AppRpcGroup
export * from "./settings"
export * from "./health"
export * from "./errors"
