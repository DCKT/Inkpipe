import { Effect, Layer } from "effect"
import { describe, it, expect } from "vitest"
import type { KomgaLibrary, KomgaSeries, KomgaBook } from "@inkpipe/shared"
import {
  komgaLibrariesHandler,
  komgaSeriesHandler,
  komgaThumbnailHandler,
  komgaBooksHandler,
} from "../routes/komga"
import { KomgaService } from "../layers/Komga"

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
  it("returns libraries as JSON", async () => {
    const response = await Effect.runPromise(
      komgaLibrariesHandler.pipe(Effect.provide(makeKomgaLayer())),
    )
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body).toEqual(mockLibraries)
  })

  it("returns 502 on error", async () => {
    const layer = Layer.succeed(KomgaService, {
      listLibraries: Effect.fail({ message: "Error" } as any),
      listAllSeries: () => Effect.succeed([]),
      getSeriesThumbnail: () => Effect.succeed(""),
      getBooksForSeries: () => Effect.succeed([]),
    } as any)
    const response = await Effect.runPromise(
      komgaLibrariesHandler.pipe(Effect.provide(layer)),
    )
    expect(response.status).toBe(502)
  })
})

describe("komgaSeriesHandler", () => {
  it("returns series as JSON", async () => {
    const response = await Effect.runPromise(
      komgaSeriesHandler("lib-1").pipe(Effect.provide(makeKomgaLayer())),
    )
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body).toEqual(mockSeries)
  })

  it("returns 502 on error", async () => {
    const layer = Layer.succeed(KomgaService, {
      listLibraries: Effect.succeed([]),
      listAllSeries: () => Effect.fail({ message: "Error" } as any),
      getSeriesThumbnail: () => Effect.succeed(""),
      getBooksForSeries: () => Effect.succeed([]),
    } as any)
    const response = await Effect.runPromise(
      komgaSeriesHandler().pipe(Effect.provide(layer)),
    )
    expect(response.status).toBe(502)
  })
})

describe("komgaThumbnailHandler", () => {
  it("returns thumbnail as JSON", async () => {
    const response = await Effect.runPromise(
      komgaThumbnailHandler("s1").pipe(Effect.provide(makeKomgaLayer())),
    )
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.thumbnail).toBe("data:image/jpeg;base64,/9j/")
  })

  it("returns 502 on error", async () => {
    const layer = Layer.succeed(KomgaService, {
      listLibraries: Effect.succeed([]),
      listAllSeries: () => Effect.succeed([]),
      getSeriesThumbnail: () => Effect.fail({ message: "Error" } as any),
      getBooksForSeries: () => Effect.succeed([]),
    } as any)
    const response = await Effect.runPromise(
      komgaThumbnailHandler("s1").pipe(Effect.provide(layer)),
    )
    expect(response.status).toBe(502)
  })
})

describe("komgaBooksHandler", () => {
  it("returns books as JSON", async () => {
    const response = await Effect.runPromise(
      komgaBooksHandler("s1").pipe(Effect.provide(makeKomgaLayer())),
    )
    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body).toEqual(mockBooks)
  })

  it("returns 502 on error", async () => {
    const layer = Layer.succeed(KomgaService, {
      listLibraries: Effect.succeed([]),
      listAllSeries: () => Effect.succeed([]),
      getSeriesThumbnail: () => Effect.succeed(""),
      getBooksForSeries: () => Effect.fail({ message: "Error" } as any),
    } as any)
    const response = await Effect.runPromise(
      komgaBooksHandler("s1").pipe(Effect.provide(layer)),
    )
    expect(response.status).toBe(502)
  })
})
