import { Effect, Layer } from "effect"
import { describe, it, expect } from "@effect/vitest"
import type { KomgaLibrary, KomgaSeries, KomgaBook } from "@inkpipe/shared"
import {
  komgaLibrariesHandler,
  komgaSeriesHandler,
  komgaThumbnailHandler,
  komgaBooksHandler,
} from "../routes/komga"
import { KomgaService } from "../layers/integrations/Komga"

const mockLibraries: KomgaLibrary[] = [
  { id: "lib-1", name: "Manga" },
]

const mockSeries: KomgaSeries[] = [
  { id: "s1", name: "Naruto", booksCount: 72, metadata: { status: "ONGOING", title: "Naruto" } },
]

const mockBooks: KomgaBook[] = [
  { id: "b1", name: "Ch.1", number: 1, created: "2024-01-01", size: "10MB", media: { pagesCount: 42, mediaType: "application/epub+zip" }, metadata: { title: "Ch.1", number: "1" } },
]

function makeKomgaLayer() {
  return Layer.succeed(KomgaService, {
    listLibraries: Effect.succeed(mockLibraries),
    listAllSeries: () => Effect.succeed(mockSeries),
    getSeriesThumbnail: () => Effect.succeed("data:image/jpeg;base64,/9j/"),
    getBooksForSeries: () => Effect.succeed(mockBooks),
  } as any)
}

describe("komgaLibrariesHandler", () => {
  it.effect("returns libraries as JSON", () =>
    Effect.gen(function*() {
      const response = yield* komgaLibrariesHandler.pipe(Effect.provide(makeKomgaLayer()))
      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body).toEqual(mockLibraries)
    }))

  it.effect("returns 502 on error", () =>
    Effect.gen(function*() {
      const layer = Layer.succeed(KomgaService, {
        listLibraries: Effect.fail({ message: "Error" } as any),
        listAllSeries: () => Effect.succeed([]),
        getSeriesThumbnail: () => Effect.succeed(""),
        getBooksForSeries: () => Effect.succeed([]),
      } as any)
      const response = yield* komgaLibrariesHandler.pipe(Effect.provide(layer))
      expect(response.status).toBe(502)
    }))
})

describe("komgaSeriesHandler", () => {
  it.effect("returns series as JSON", () =>
    Effect.gen(function*() {
      const response = yield* komgaSeriesHandler("lib-1").pipe(Effect.provide(makeKomgaLayer()))
      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body).toEqual(mockSeries)
    }))

  it.effect("returns 502 on error", () =>
    Effect.gen(function*() {
      const layer = Layer.succeed(KomgaService, {
        listLibraries: Effect.succeed([]),
        listAllSeries: () => Effect.fail({ message: "Error" } as any),
        getSeriesThumbnail: () => Effect.succeed(""),
        getBooksForSeries: () => Effect.succeed([]),
      } as any)
      const response = yield* komgaSeriesHandler().pipe(Effect.provide(layer))
      expect(response.status).toBe(502)
    }))
})

describe("komgaThumbnailHandler", () => {
  it.effect("returns thumbnail as JSON", () =>
    Effect.gen(function*() {
      const response = yield* komgaThumbnailHandler("s1").pipe(Effect.provide(makeKomgaLayer()))
      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.thumbnail).toBe("data:image/jpeg;base64,/9j/")
    }))

  it.effect("returns 502 on error", () =>
    Effect.gen(function*() {
      const layer = Layer.succeed(KomgaService, {
        listLibraries: Effect.succeed([]),
        listAllSeries: () => Effect.succeed([]),
        getSeriesThumbnail: () => Effect.fail({ message: "Error" } as any),
        getBooksForSeries: () => Effect.succeed([]),
      } as any)
      const response = yield* komgaThumbnailHandler("s1").pipe(Effect.provide(layer))
      expect(response.status).toBe(502)
    }))
})

describe("komgaBooksHandler", () => {
  it.effect("returns books as JSON", () =>
    Effect.gen(function*() {
      const response = yield* komgaBooksHandler("s1").pipe(Effect.provide(makeKomgaLayer()))
      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body).toEqual(mockBooks)
    }))

  it.effect("returns 502 on error", () =>
    Effect.gen(function*() {
      const layer = Layer.succeed(KomgaService, {
        listLibraries: Effect.succeed([]),
        listAllSeries: () => Effect.succeed([]),
        getSeriesThumbnail: () => Effect.succeed(""),
        getBooksForSeries: () => Effect.fail({ message: "Error" } as any),
      } as any)
      const response = yield* komgaBooksHandler("s1").pipe(Effect.provide(layer))
      expect(response.status).toBe(502)
    }))
})
