import { implement } from "@inkpipe/capability/implement"
import { NoMagnetUrl, downloadContract, saveMagnetContract } from "@inkpipe/shared"
import { Effect } from "effect"
import { AllDebridService } from "../layers/integrations/AllDebrid"
import { CopypartyService } from "../layers/integrations/Copyparty"
import { PipelineService } from "../layers/pipeline/Pipeline"

export const download = implement(downloadContract, ({ items, subfolder, newFolder }) =>
  Effect.gen(function* () {
    const pipeline = yield* PipelineService
    const copyparty = yield* CopypartyService

    let createdFolder = false
    if (subfolder && newFolder) {
      yield* copyparty.createFolder(subfolder)
      createdFolder = true
    }

    for (const item of items) {
      yield* Effect.forkDetach(
        pipeline.runPipeline(item, subfolder, createdFolder).pipe(Effect.ignore),
      )
    }

    return { started: items.length }
  }),
)

export const saveMagnet = implement(saveMagnetContract, ({ magnetUrl, downloadUrl }) =>
  Effect.gen(function* () {
    const allDebrid = yield* AllDebridService

    const target = magnetUrl ?? downloadUrl
    if (!target) {
      return yield* new NoMagnetUrl({ message: "No magnet or download URL provided" })
    }

    return yield* allDebrid.uploadMagnet(target)
  }),
)

export const downloadCapabilities = [download, saveMagnet] as const
