import { Effect } from "effect"
import { type AnnasArchiveResult } from "@inkpipe/shared"
import { AnnasArchiveService } from "../layers/integrations/AnnasArchive"
import { AnnasArchivePipelineService } from "../layers/pipeline/AnnasArchivePipeline"
import { CopypartyService } from "../layers/integrations/Copyparty"

export const annasArchiveSearchHandler = (query: string) =>
  Effect.gen(function* () {
    const annasArchive = yield* AnnasArchiveService
    const results = yield* annasArchive.search(query)
    return Response.json(results satisfies AnnasArchiveResult[])
  }).pipe(
    Effect.catch((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 502 }),
      ),
    ),
  )

export const annasArchiveDownloadHandler = (body: { items: AnnasArchiveResult[]; subfolder?: string; newFolder?: boolean }) =>
  Effect.gen(function* () {
    const pipeline = yield* AnnasArchivePipelineService
    const copyparty = yield* CopypartyService

    let createdFolder = false

    if (body.subfolder && body.newFolder) {
      yield* copyparty.createFolder(body.subfolder)
      createdFolder = true
    }

    for (const item of body.items) {
      Effect.runFork(
        pipeline.run(item, body.subfolder, createdFolder).pipe(
          Effect.catch(() => Effect.void),
        ),
      )
    }

    return Response.json({ started: body.items.length })
  }).pipe(
    Effect.catch((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 502 }),
      ),
    ),
  )
