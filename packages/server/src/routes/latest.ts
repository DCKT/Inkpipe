import { Effect } from "effect"
import { type ProwlarrResult } from "@inkpipe/shared"
import { ProwlarrService } from "../layers/Prowlarr"

export const latestHandler = Effect.gen(function* () {
  const prowlarr = yield* ProwlarrService
  const results = yield* prowlarr.getLatest
  return Response.json(results satisfies ProwlarrResult[])
}).pipe(
  Effect.catchAll((e: { message: string }) =>
    Effect.succeed(
      Response.json({ error: e.message }, { status: 502 }),
    ),
  ),
)
