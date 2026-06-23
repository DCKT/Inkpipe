import { Effect } from "effect"
import type { PushSubscriptionRequest } from "@inkpipe/shared"
import { PushService } from "../layers/Push"

export const getVapidPublicKeyHandler = Effect.gen(function* () {
  const push = yield* PushService
  const key = yield* push.getVapidPublicKey
  return Response.json({ publicKey: key })
}).pipe(
  Effect.catchAll((e: { message: string }) =>
    Effect.succeed(Response.json({ error: e.message }, { status: 500 })),
  ),
)

export const subscribeHandler = (body: PushSubscriptionRequest) =>
  Effect.gen(function* () {
    const push = yield* PushService
    yield* push.addSubscription(body)
    return Response.json({ success: true }, { status: 201 })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 500 })),
    ),
  )

export const unsubscribeHandler = (body: { endpoint: string }) =>
  Effect.gen(function* () {
    const push = yield* PushService
    yield* push.removeSubscription(body.endpoint)
    return Response.json({ success: true })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(Response.json({ error: e.message }, { status: 500 })),
    ),
  )
