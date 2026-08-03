import { Effect } from "effect"
import { type ProwlarrResult } from "@inkpipe/shared"
import { ProwlarrService } from "../layers/integrations/Prowlarr"

export const searchHandler = (query: string) =>
  Effect.gen(function* () {
    const prowlarr = yield* ProwlarrService
    const results = yield* prowlarr.search(query)
    return Response.json(results satisfies ProwlarrResult[])
  }).pipe(
    Effect.catch((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 502 }),
      ),
    ),
  )
