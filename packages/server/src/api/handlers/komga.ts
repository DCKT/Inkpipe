import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { KomgaService } from "../../layers/integrations/Komga"
import { InkpipeApi } from "@inkpipe/shared"

export const KomgaGroupLive = HttpApiBuilder.group(InkpipeApi, "komga", (handlers) =>
  handlers
    .handle("libraries", () =>
      Effect.gen(function* () {
        const komga = yield* KomgaService
        return yield* komga.listLibraries
      }))
    .handle("series", ({ payload }) =>
      Effect.gen(function* () {
        const komga = yield* KomgaService
        return yield* komga.listAllSeries(payload.libraryId)
      }))
    .handle("thumbnail", ({ query }) =>
      Effect.gen(function* () {
        const komga = yield* KomgaService
        const thumbnail = yield* komga.getSeriesThumbnail(query.seriesId)
        return { thumbnail }
      }))
    .handle("books", ({ payload }) =>
      Effect.gen(function* () {
        const komga = yield* KomgaService
        return yield* komga.getBooksForSeries(payload.seriesId)
      })),
)
