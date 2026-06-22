import { Effect } from "effect"
import { HealthRpcGroup } from "@inkpipe/shared/rpc"

export const HealthHandlersLive = HealthRpcGroup.toLayer({
  "health.ping": () =>
    Effect.gen(function* () {
      console.log("[health.ping] called!")
      return "pong"
    }),
})
