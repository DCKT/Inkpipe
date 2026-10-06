import { defineContract } from "@inkpipe/capability/contract"
import { Schema } from "effect"
import {
  CopypartyFoldersResponseSchema,
  CreateFolderRequestSchema,
  CreateFolderResponseSchema,
} from "../api"
import {
  CopypartyFolderErrorS,
  CopypartyHttpErrorS,
  CopypartyNotConfiguredS,
} from "../httpApi/errors"

const ReadFailure = Schema.Union([CopypartyNotConfiguredS, CopypartyHttpErrorS])
const WriteFailure = Schema.Union([
  CopypartyNotConfiguredS,
  CopypartyHttpErrorS,
  CopypartyFolderErrorS,
])

export const listFoldersContract = defineContract("listFolders", {
  description: "List the folders available on the Copyparty server",
  annotations: { readOnly: true, idempotent: true, openWorld: true },
  http: { method: "GET", path: "/api/copyparty/folders" },
  input: Schema.Struct({}),
  output: CopypartyFoldersResponseSchema,
  failure: ReadFailure,
})

export const createFolderContract = defineContract("createFolder", {
  description: "Create a folder on the Copyparty server",
  annotations: { openWorld: true },
  http: { method: "POST", path: "/api/copyparty/folders" },
  input: CreateFolderRequestSchema,
  output: CreateFolderResponseSchema,
  failure: WriteFailure,
})

export const deleteFolderContract = defineContract("deleteFolder", {
  description: "Delete a folder from the Copyparty server",
  annotations: { destructive: true, idempotent: true, openWorld: true },
  http: { method: "DELETE", path: "/api/copyparty/folders" },
  input: CreateFolderRequestSchema,
  output: CreateFolderResponseSchema,
  failure: WriteFailure,
})

export const copypartyContracts = [
  listFoldersContract,
  createFolderContract,
  deleteFolderContract,
] as const
