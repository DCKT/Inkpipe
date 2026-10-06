import { defineContract } from "@inkpipe/capability/contract"
import { Schema } from "effect"
import { HttpApiSchema } from "effect/http-api"
import { PushSubscriptionRequestSchema } from "../api"
import { SuccessFlagSchema } from "./settings"

export const VapidPublicKeyResponseSchema = Schema.Struct({ publicKey: Schema.String })
export const UnsubscribeRequestSchema = Schema.Struct({ endpoint: Schema.String })

export const getVapidPublicKeyContract = defineContract("getVapidPublicKey", {
  description: "Read the public VAPID key browsers need to subscribe to push notifications",
  annotations: { readOnly: true, idempotent: true },
  http: { method: "GET", path: "/api/push/vapid-public-key" },
  input: Schema.Struct({}),
  output: VapidPublicKeyResponseSchema,
  failure: Schema.Never,
})

export const subscribePushContract = defineContract("subscribePush", {
  description: "Register a browser push subscription",
  annotations: { idempotent: true },
  http: { method: "POST", path: "/api/push/subscribe" },
  input: PushSubscriptionRequestSchema,
  output: SuccessFlagSchema.pipe(HttpApiSchema.status(201)),
  failure: Schema.Never,
})

export const unsubscribePushContract = defineContract("unsubscribePush", {
  description: "Remove a browser push subscription",
  annotations: { destructive: true, idempotent: true },
  http: { method: "DELETE", path: "/api/push/subscribe" },
  input: UnsubscribeRequestSchema,
  output: SuccessFlagSchema,
  failure: Schema.Never,
})

export const pushContracts = [
  getVapidPublicKeyContract,
  subscribePushContract,
  unsubscribePushContract,
] as const
