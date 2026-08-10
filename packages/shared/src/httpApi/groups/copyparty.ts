import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { CopypartyFoldersResponseSchema, CreateFolderRequestSchema, CreateFolderResponseSchema } from "../../api"
import { CopypartyNotConfiguredS, CopypartyHttpErrorS, CopypartyFolderErrorS } from "../errors"

export const CopypartyGroup = HttpApiGroup.make("copyparty").add(
  HttpApiEndpoint.get("listFolders", "/api/copyparty/folders", {
    success: CopypartyFoldersResponseSchema,
    error: [CopypartyNotConfiguredS, CopypartyHttpErrorS],
  }),
).add(
  HttpApiEndpoint.post("createFolder", "/api/copyparty/folders", {
    payload: CreateFolderRequestSchema,
    success: CreateFolderResponseSchema,
    error: [CopypartyNotConfiguredS, CopypartyHttpErrorS, CopypartyFolderErrorS],
  }),
).add(
  HttpApiEndpoint.delete("deleteFolder", "/api/copyparty/folders", {
    payload: CreateFolderRequestSchema,
    success: CreateFolderResponseSchema,
    error: [CopypartyNotConfiguredS, CopypartyHttpErrorS, CopypartyFolderErrorS],
  }),
)
