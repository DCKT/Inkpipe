import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { CopypartyService } from "../../layers/integrations/Copyparty"
import { InkpipeApi } from "@inkpipe/shared"

export const CopypartyGroupLive = HttpApiBuilder.group(InkpipeApi, "copyparty", (handlers) =>
  handlers
    .handle("listFolders", () =>
      Effect.gen(function* () {
        const copyparty = yield* CopypartyService
        const folders = yield* copyparty.listFolders
        return { folders }
      }))
    .handle("createFolder", ({ payload }) =>
      Effect.gen(function* () {
        const copyparty = yield* CopypartyService
        yield* copyparty.createFolder(payload.name)
        return { name: payload.name }
      }))
    .handle("deleteFolder", ({ payload }) =>
      Effect.gen(function* () {
        const copyparty = yield* CopypartyService
        yield* copyparty.deleteFolder(payload.name)
        return { name: payload.name }
      })),
)
