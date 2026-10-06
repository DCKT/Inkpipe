import { defineContract } from "@inkpipe/capability/contract"
import { Schema } from "effect"
import { DownloadResponseSchema } from "../api"
import { AnnasArchiveResultSchema } from "../schemas"
import {
  AnnasArchiveHttpErrorS,
  CopypartyFolderErrorS,
  CopypartyHttpErrorS,
  CopypartyNotConfiguredS,
} from "../httpApi/errors"

export const AnnasArchiveDownloadRequestSchema = Schema.Struct({
  items: Schema.Array(AnnasArchiveResultSchema),
  subfolder: Schema.optional(Schema.String),
  newFolder: Schema.optional(Schema.Boolean),
})
export type AnnasArchiveDownloadRequest = typeof AnnasArchiveDownloadRequestSchema.Type

export const searchAnnasArchiveContract = defineContract("searchAnnasArchive", {
  description: "Search Anna's Archive for books",
  annotations: { readOnly: true, idempotent: true, openWorld: true },
  http: { method: "GET", path: "/api/annas-archive/search" },
  input: Schema.Struct({ q: Schema.optional(Schema.String) }),
  output: Schema.Array(AnnasArchiveResultSchema),
  failure: AnnasArchiveHttpErrorS,
})

export const downloadAnnasArchiveContract = defineContract("downloadAnnasArchive", {
  description: "Download the selected Anna's Archive books and upload them to Copyparty",
  annotations: { openWorld: true },
  http: { method: "POST", path: "/api/annas-archive/download" },
  input: AnnasArchiveDownloadRequestSchema,
  output: DownloadResponseSchema,
  failure: Schema.Union([CopypartyNotConfiguredS, CopypartyHttpErrorS, CopypartyFolderErrorS]),
})

export const annasArchiveContracts = [
  searchAnnasArchiveContract,
  downloadAnnasArchiveContract,
] as const
