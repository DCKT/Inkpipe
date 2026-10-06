import { implement } from "@inkpipe/capability/implement"
import { downloadAnnasArchiveContract, searchAnnasArchiveContract } from "@inkpipe/shared"
import { Effect } from "effect"
import { AnnasArchiveService } from "../layers/integrations/AnnasArchive"
import { CopypartyService } from "../layers/integrations/Copyparty"
import { AnnasArchivePipelineService } from "../layers/pipeline/AnnasArchivePipeline"

export const searchAnnasArchive = implement(searchAnnasArchiveContract, ({ q }) =>
  AnnasArchiveService.use((annasArchive) => annasArchive.search(q ?? "")),
)

export const downloadAnnasArchive = implement(
  downloadAnnasArchiveContract,
  ({ items, subfolder, newFolder }) =>
    Effect.gen(function* () {
      const pipeline = yield* AnnasArchivePipelineService
      const copyparty = yield* CopypartyService

      let createdFolder = false
      if (subfolder && newFolder) {
        yield* copyparty.createFolder(subfolder)
        createdFolder = true
      }

      for (const item of items) {
        yield* Effect.forkDetach(pipeline.run(item, subfolder, createdFolder).pipe(Effect.ignore))
      }

      return { started: items.length }
    }),
)

export const annasArchiveCapabilities = [searchAnnasArchive, downloadAnnasArchive] as const
