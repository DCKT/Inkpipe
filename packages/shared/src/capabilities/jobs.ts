import { defineContract } from "@inkpipe/capability/contract"
import { Schema } from "effect"
import { ClearJobsResponseSchema, JobsResponseSchema } from "../api"

export const listJobsContract = defineContract("listJobs", {
  description: "List every pipeline job with its stage and progress",
  annotations: { readOnly: true, idempotent: true },
  http: { method: "GET", path: "/api/jobs" },
  input: Schema.Struct({}),
  output: JobsResponseSchema,
  failure: Schema.Never,
})

export const clearJobsContract = defineContract("clearJobs", {
  description: "Delete every finished job and report how many were removed",
  annotations: { destructive: true, idempotent: true },
  http: { method: "DELETE", path: "/api/jobs" },
  input: Schema.Struct({}),
  output: ClearJobsResponseSchema,
  failure: Schema.Never,
})

export const jobsContracts = [listJobsContract, clearJobsContract] as const
