import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import {
  WatchesListResponseSchema,
  WatchResponseSchema,
  CreateWatchRequestSchema,
  UpdateWatchRequestSchema,
  WatchAlertsResponseSchema,
  UnreadCountResponseSchema,
} from "../../api"
import { WatchNotFoundErrorS, WatchStoreErrorS, ValidationErrorS } from "../errors"

const WatchErrors = [WatchNotFoundErrorS, WatchStoreErrorS] as const

export const WatchIdParamSchema = Schema.Struct({ id: Schema.FiniteFromString })
export const WatchAlertIdParamSchema = Schema.Struct({
  id: Schema.FiniteFromString,
  alertId: Schema.FiniteFromString,
})
export const SuccessFlagSchema = Schema.Struct({ success: Schema.Boolean })
export const TriggerResponseSchema = Schema.Struct({ matches: Schema.Finite })

export const WatchesGroup = HttpApiGroup.make("watches").add(
  HttpApiEndpoint.get("list", "/api/watches", {
    success: WatchesListResponseSchema,
    error: [WatchStoreErrorS],
  }),
).add(
  HttpApiEndpoint.get("unreadCount", "/api/watches/unread-count", {
    success: UnreadCountResponseSchema,
    error: [WatchStoreErrorS],
  }),
).add(
  HttpApiEndpoint.post("create", "/api/watches", {
    payload: CreateWatchRequestSchema,
    success: WatchResponseSchema.pipe(HttpApiSchema.status(201)),
    error: [WatchStoreErrorS, ValidationErrorS],
  }),
).add(
  HttpApiEndpoint.get("get", "/api/watches/:id", {
    params: { id: Schema.FiniteFromString },
    success: WatchResponseSchema,
    error: WatchErrors,
  }),
).add(
  HttpApiEndpoint.put("update", "/api/watches/:id", {
    params: { id: Schema.FiniteFromString },
    payload: UpdateWatchRequestSchema,
    success: WatchResponseSchema,
    error: [...WatchErrors, ValidationErrorS],
  }),
).add(
  HttpApiEndpoint.delete("delete", "/api/watches/:id", {
    params: { id: Schema.FiniteFromString },
    success: SuccessFlagSchema,
    error: WatchErrors,
  }),
).add(
  HttpApiEndpoint.get("listAlerts", "/api/watches/:id/alerts", {
    params: { id: Schema.FiniteFromString },
    success: WatchAlertsResponseSchema,
    error: WatchErrors,
  }),
).add(
  HttpApiEndpoint.post("acknowledgeAlert", "/api/watches/:id/alerts/:alertId/acknowledge", {
    params: { id: Schema.FiniteFromString, alertId: Schema.FiniteFromString },
    success: SuccessFlagSchema,
    error: WatchErrors,
  }),
).add(
  HttpApiEndpoint.post("acknowledgeAllAlerts", "/api/watches/:id/alerts/acknowledge-all", {
    params: { id: Schema.FiniteFromString },
    success: SuccessFlagSchema,
    error: [WatchStoreErrorS],
  }),
).add(
  HttpApiEndpoint.post("trigger", "/api/watches/:id/trigger", {
    params: { id: Schema.FiniteFromString },
    success: TriggerResponseSchema,
    error: WatchErrors,
  }),
)
