import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ProwlarrService } from "../../layers/integrations/Prowlarr"
import { InkpipeApi } from "@inkpipe/shared"

export const SearchGroupLive = HttpApiBuilder.group(InkpipeApi, "search", (handlers) =>
  handlers.handle("search", ({ query }) =>
    Effect.gen(function* () {
      const prowlarr = yield* ProwlarrService
      return yield* prowlarr.search(query.q ?? "")
    })),
)
