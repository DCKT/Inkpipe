import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { AnnasArchiveService } from "../../layers/integrations/AnnasArchive"
import { AnnasArchivePipelineService } from "../../layers/pipeline/AnnasArchivePipeline"
import { CopypartyService } from "../../layers/integrations/Copyparty"
import { InkpipeApi } from "@inkpipe/shared"

export const AnnasArchiveGroupLive = HttpApiBuilder.group(InkpipeApi, "annasArchive", (handlers) =>
  handlers
    .handle("search", ({ query }) =>
      Effect.gen(function* () {
        const annasArchive = yield* AnnasArchiveService
        return yield* annasArchive.search(query.q ?? "")
      }))
    .handle("download", ({ payload }) =>
      Effect.gen(function* () {
        const pipeline = yield* AnnasArchivePipelineService
        const copyparty = yield* CopypartyService

        let createdFolder = false
        if (payload.subfolder && payload.newFolder) {
          yield* copyparty.createFolder(payload.subfolder)
          createdFolder = true
        }

        for (const item of payload.items) {
          Effect.runFork(
            pipeline.run(item, payload.subfolder, createdFolder).pipe(
              Effect.catch(() => Effect.void),
            ),
          )
        }

        return { started: payload.items.length }
      })),
)
