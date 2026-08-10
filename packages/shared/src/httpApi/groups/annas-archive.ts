import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { AnnasArchiveResultSchema } from "../../schemas"
import { DownloadResponseSchema } from "../../api"
import { AnnasArchiveHttpErrorS, CopypartyNotConfiguredS, CopypartyHttpErrorS, CopypartyFolderErrorS } from "../errors"

export const AnnasArchiveDownloadRequestSchema = Schema.Struct({
  items: Schema.Array(AnnasArchiveResultSchema),
  subfolder: Schema.optional(Schema.String),
  newFolder: Schema.optional(Schema.Boolean),
})
export type AnnasArchiveDownloadRequest = typeof AnnasArchiveDownloadRequestSchema.Type

export const AnnasArchiveGroup = HttpApiGroup.make("annasArchive").add(
  HttpApiEndpoint.get("search", "/api/annas-archive/search", {
    query: { q: Schema.optional(Schema.String) },
    success: Schema.Array(AnnasArchiveResultSchema),
    error: [AnnasArchiveHttpErrorS],
  }),
).add(
  HttpApiEndpoint.post("download", "/api/annas-archive/download", {
    payload: AnnasArchiveDownloadRequestSchema,
    success: DownloadResponseSchema,
    error: [CopypartyNotConfiguredS, CopypartyHttpErrorS, CopypartyFolderErrorS],
  }),
)
