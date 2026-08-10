import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ProwlarrService } from "../../layers/integrations/Prowlarr"
import { InkpipeApi } from "@inkpipe/shared"

export const LatestGroupLive = HttpApiBuilder.group(InkpipeApi, "latest", (handlers) =>
  handlers.handle("latest", () =>
    Effect.gen(function* () {
      const prowlarr = yield* ProwlarrService
      return yield* prowlarr.getLatest
    })),
)
