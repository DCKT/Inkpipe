import { Effect } from "effect"
import type { ProwlarrResult } from "@inkpipe/shared"
import { PipelineService } from "../layers/pipeline/Pipeline"
import { CopypartyService } from "../layers/integrations/Copyparty"

export const downloadHandler = (body: { items: ProwlarrResult[]; subfolder?: string; newFolder?: boolean }) =>
  Effect.gen(function* () {
    const pipeline = yield* PipelineService
    const copyparty = yield* CopypartyService

    let createdFolder = false

    if (body.subfolder && body.newFolder) {
      yield* copyparty.createFolder(body.subfolder)
      createdFolder = true
    }

    for (const item of body.items) {
      Effect.runFork(
        pipeline.runPipeline(item, body.subfolder, createdFolder).pipe(
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
