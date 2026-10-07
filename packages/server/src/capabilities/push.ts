import { implement } from "@inkpipe/capability/implement"
import {
  getVapidPublicKeyContract,
  subscribePushContract,
  unsubscribePushContract,
} from "@inkpipe/shared"
import { Effect } from "effect"
import { PushService } from "../layers/pipeline/Push"

export const getVapidPublicKey = implement(getVapidPublicKeyContract, () =>
  PushService.use((push) => push.getVapidPublicKey).pipe(
    Effect.map((publicKey) => ({ publicKey })),
  ),
)

export const subscribePush = implement(subscribePushContract, (subscription) =>
  PushService.use((push) => push.addSubscription(subscription)).pipe(Effect.as({ success: true })),
)

export const unsubscribePush = implement(unsubscribePushContract, ({ endpoint }) =>
  PushService.use((push) => push.removeSubscription(endpoint)).pipe(Effect.as({ success: true })),
)

export const pushCapabilities = [getVapidPublicKey, subscribePush, unsubscribePush] as const
