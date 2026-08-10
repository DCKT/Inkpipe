import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { PushService } from "../../layers/pipeline/Push"
import { InkpipeApi } from "@inkpipe/shared"

export const PushGroupLive = HttpApiBuilder.group(InkpipeApi, "push", (handlers) =>
  handlers
    .handle("vapidPublicKey", () =>
      Effect.gen(function* () {
        const push = yield* PushService
        const publicKey = yield* push.getVapidPublicKey
        return { publicKey }
      }))
    .handle("subscribe", ({ payload }) =>
      Effect.gen(function* () {
        const push = yield* PushService
        yield* push.addSubscription(payload)
        return { success: true }
      }))
    .handle("unsubscribe", ({ payload }) =>
      Effect.gen(function* () {
        const push = yield* PushService
        yield* push.removeSubscription(payload.endpoint)
        return { success: true }
      })),
)
