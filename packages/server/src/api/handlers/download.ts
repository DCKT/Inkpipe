import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { PipelineService } from "../../layers/pipeline/Pipeline"
import { CopypartyService } from "../../layers/integrations/Copyparty"
import { InkpipeApi } from "@inkpipe/shared"

export const DownloadGroupLive = HttpApiBuilder.group(InkpipeApi, "download", (handlers) =>
  handlers.handle("download", ({ payload }) =>
    Effect.gen(function* () {
      const pipeline = yield* PipelineService
      const copyparty = yield* CopypartyService

      let createdFolder = false
      if (payload.subfolder && payload.newFolder) {
        yield* copyparty.createFolder(payload.subfolder)
        createdFolder = true
      }

      for (const item of payload.items) {
        yield* Effect.forkDetach(
          pipeline.runPipeline(item, payload.subfolder, createdFolder).pipe(Effect.ignore),
        )
      }

      return { started: payload.items.length }
    })),
)
