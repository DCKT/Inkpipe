import { Schema } from "effect"
import * as Rpc from "@effect/rpc/Rpc"
import * as RpcGroup from "@effect/rpc/RpcGroup"

export const Ping = Rpc.make("health.ping", {
  success: Schema.String,
})

export const HealthRpcGroup = RpcGroup.make(Ping)
