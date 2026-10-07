import { defineContract } from "@inkpipe/capability/contract"
import { Schema } from "effect"
import { ProwlarrResultSchema } from "../schemas"
import { ProwlarrHttpErrorS, ProwlarrNotConfiguredS } from "../httpApi/errors"

const Failure = Schema.Union([ProwlarrNotConfiguredS, ProwlarrHttpErrorS])

export const searchProwlarrContract = defineContract("searchProwlarr", {
  description: "Search Prowlarr indexers for releases matching a query",
  annotations: { readOnly: true, idempotent: true, openWorld: true },
  http: { method: "GET", path: "/api/search" },
  input: Schema.Struct({ q: Schema.optional(Schema.String) }),
  output: Schema.Array(ProwlarrResultSchema),
  failure: Failure,
})

export const getLatestContract = defineContract("getLatest", {
  description: "List the latest releases Prowlarr has indexed",
  annotations: { readOnly: true, idempotent: true, openWorld: true },
  http: { method: "GET", path: "/api/latest" },
  input: Schema.Struct({}),
  output: Schema.Array(ProwlarrResultSchema),
  failure: Failure,
})

export const prowlarrContracts = [searchProwlarrContract, getLatestContract] as const
