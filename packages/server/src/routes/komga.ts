import { Effect } from "effect"
import { KomgaService } from "../layers/Komga"

export const komgaLibrariesHandler = Effect.gen(function* () {
  const komga = yield* KomgaService
  const libraries = yield* komga.listLibraries
  return Response.json(libraries)
}).pipe(
  Effect.catchAll((e: { message: string }) =>
    Effect.succeed(
      Response.json({ error: e.message }, { status: 502 }),
    ),
  ),
)

export const komgaSeriesHandler = (libraryId?: string) =>
  Effect.gen(function* () {
    const komga = yield* KomgaService
    const series = yield* komga.listAllSeries(libraryId || undefined)
    return Response.json(series)
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 502 }),
      ),
    ),
  )

export const komgaThumbnailHandler = (seriesId: string) =>
  Effect.gen(function* () {
    const komga = yield* KomgaService
    const base64 = yield* komga.getSeriesThumbnail(seriesId)
    return Response.json({ thumbnail: base64 })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 502 }),
      ),
    ),
  )

export const komgaBooksHandler = (seriesId: string) =>
  Effect.gen(function* () {
    const komga = yield* KomgaService
    const books = yield* komga.getBooksForSeries(seriesId)
    return Response.json(books)
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 502 }),
      ),
    ),
  )
