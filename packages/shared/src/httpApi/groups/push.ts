import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { PushSubscriptionRequestSchema } from "../../api"

export const VapidPublicKeyResponseSchema = Schema.Struct({ publicKey: Schema.String })
export const SuccessFlagSchema = Schema.Struct({ success: Schema.Boolean })
export const UnsubscribeRequestSchema = Schema.Struct({ endpoint: Schema.String })

export const PushGroup = HttpApiGroup.make("push").add(
  HttpApiEndpoint.get("vapidPublicKey", "/api/push/vapid-public-key", {
    success: VapidPublicKeyResponseSchema,
  }),
).add(
  HttpApiEndpoint.post("subscribe", "/api/push/subscribe", {
    payload: PushSubscriptionRequestSchema,
    success: SuccessFlagSchema.pipe(HttpApiSchema.status(201)),
  }),
).add(
  HttpApiEndpoint.delete("unsubscribe", "/api/push/subscribe", {
    payload: UnsubscribeRequestSchema,
    success: SuccessFlagSchema,
  }),
)
