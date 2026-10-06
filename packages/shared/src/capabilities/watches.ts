import { defineContract } from "@inkpipe/capability/contract"
import { Schema } from "effect"
import { HttpApiSchema } from "effect/http-api"
import {
  CreateWatchRequestSchema,
  UnreadCountResponseSchema,
  UpdateWatchRequestSchema,
  WatchAlertsResponseSchema,
  WatchesListResponseSchema,
  WatchResponseSchema,
} from "../api"
import { ValidationErrorS, WatchNotFoundErrorS, WatchStoreErrorS } from "../httpApi/errors"
import { SuccessFlagSchema } from "./settings"

const WatchFailure = Schema.Union([WatchNotFoundErrorS, WatchStoreErrorS])
const WatchId = { id: Schema.FiniteFromString }

export const TriggerResponseSchema = Schema.Struct({ matches: Schema.Finite })

export const listWatchesContract = defineContract("listWatches", {
  description: "List every Prowlarr watch with its unread alert count",
  annotations: { readOnly: true, idempotent: true },
  http: { method: "GET", path: "/api/watches" },
  input: Schema.Struct({}),
  output: WatchesListResponseSchema,
  failure: WatchStoreErrorS,
})

export const getUnreadCountContract = defineContract("getUnreadCount", {
  description: "Count unread watch alerts across every watch",
  annotations: { readOnly: true, idempotent: true },
  http: { method: "GET", path: "/api/watches/unread-count" },
  input: Schema.Struct({}),
  output: UnreadCountResponseSchema,
  failure: WatchStoreErrorS,
})

export const createWatchContract = defineContract("createWatch", {
  description: "Create a watch that searches Prowlarr on a schedule",
  http: { method: "POST", path: "/api/watches" },
  input: CreateWatchRequestSchema,
  output: WatchResponseSchema.pipe(HttpApiSchema.status(201)),
  failure: Schema.Union([WatchStoreErrorS, ValidationErrorS]),
})

export const getWatchContract = defineContract("getWatch", {
  description: "Read one watch",
  annotations: { readOnly: true, idempotent: true },
  http: { method: "GET", path: "/api/watches/:id" },
  input: Schema.Struct(WatchId),
  output: WatchResponseSchema,
  failure: WatchFailure,
})

export const updateWatchContract = defineContract("updateWatch", {
  description: "Change a watch's name, query, interval, filters, folder or enabled flag",
  annotations: { idempotent: true },
  http: { method: "PUT", path: "/api/watches/:id" },
  input: Schema.Struct({ ...WatchId, ...UpdateWatchRequestSchema.fields }),
  output: WatchResponseSchema,
  failure: Schema.Union([WatchNotFoundErrorS, WatchStoreErrorS, ValidationErrorS]),
})

export const deleteWatchContract = defineContract("deleteWatch", {
  description: "Delete a watch and its alerts",
  annotations: { destructive: true, idempotent: true },
  http: { method: "DELETE", path: "/api/watches/:id" },
  input: Schema.Struct(WatchId),
  output: SuccessFlagSchema,
  failure: WatchFailure,
})

export const listWatchAlertsContract = defineContract("listWatchAlerts", {
  description: "List the alerts one watch has raised",
  annotations: { readOnly: true, idempotent: true },
  http: { method: "GET", path: "/api/watches/:id/alerts" },
  input: Schema.Struct(WatchId),
  output: WatchAlertsResponseSchema,
  failure: WatchFailure,
})

export const acknowledgeAlertContract = defineContract("acknowledgeAlert", {
  description: "Mark one watch alert as read",
  annotations: { idempotent: true },
  http: { method: "POST", path: "/api/watches/:id/alerts/:alertId/acknowledge" },
  input: Schema.Struct({ ...WatchId, alertId: Schema.FiniteFromString }),
  output: SuccessFlagSchema,
  failure: WatchFailure,
})

export const acknowledgeAllAlertsContract = defineContract("acknowledgeAllAlerts", {
  description: "Mark every alert of one watch as read",
  annotations: { idempotent: true },
  http: { method: "POST", path: "/api/watches/:id/alerts/acknowledge-all" },
  input: Schema.Struct(WatchId),
  output: SuccessFlagSchema,
  failure: WatchStoreErrorS,
})

export const triggerWatchContract = defineContract("triggerWatch", {
  description: "Run a watch's search now and record any new matches",
  annotations: { openWorld: true },
  http: { method: "POST", path: "/api/watches/:id/trigger" },
  input: Schema.Struct(WatchId),
  output: TriggerResponseSchema,
  failure: WatchFailure,
})

export const watchesContracts = [
  listWatchesContract,
  getUnreadCountContract,
  createWatchContract,
  getWatchContract,
  updateWatchContract,
  deleteWatchContract,
  listWatchAlertsContract,
  acknowledgeAlertContract,
  acknowledgeAllAlertsContract,
  triggerWatchContract,
] as const
