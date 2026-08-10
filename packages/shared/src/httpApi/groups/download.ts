import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { DownloadRequestSchema, DownloadResponseSchema } from "../../api"
import { CopypartyNotConfiguredS, CopypartyHttpErrorS, CopypartyFolderErrorS } from "../errors"

export const DownloadGroup = HttpApiGroup.make("download").add(
  HttpApiEndpoint.post("download", "/api/download", {
    payload: DownloadRequestSchema,
    success: DownloadResponseSchema,
    error: [CopypartyNotConfiguredS, CopypartyHttpErrorS, CopypartyFolderErrorS],
  }),
)
