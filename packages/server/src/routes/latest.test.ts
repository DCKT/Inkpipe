import { Effect, Layer } from "effect"
import { describe, it, expect } from "@effect/vitest"
import type { ProwlarrResult } from "@inkpipe/shared"
import { latestHandler } from "../routes/latest"
import { ProwlarrService } from "../layers/integrations/Prowlarr"

const mockResults: ProwlarrResult[] = [
  {
    title: "Latest Manga", guid: "g1", magnetUrl: "magnet:?xt=urn:btih:abc",
    downloadUrl: null, size: 50000, seeders: 3, indexer: "Nyaa",
    categories: ["Manga"], publishDate: "2024-06-14T00:00:00Z",
  },
]

describe("latestHandler", () => {
  it.effect("returns latest results as JSON", () =>
    Effect.gen(function*() {
      const layer = Layer.succeed(ProwlarrService, {
        search: () => Effect.succeed([]),
        getLatest: Effect.succeed(mockResults),
      } as any)

      const response = yield* latestHandler.pipe(Effect.provide(layer))

      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body).toEqual(mockResults)
    }))

  it.effect("returns 502 with error message on failure", () =>
    Effect.gen(function*() {
      const layer = Layer.succeed(ProwlarrService, {
        search: () => Effect.succeed([]),
        getLatest: Effect.fail({ message: "Prowlarr HTTP error" } as any),
      } as any)

      const response = yield* latestHandler.pipe(Effect.provide(layer))

      expect(response.status).toBe(502)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.error).toBe("Prowlarr HTTP error")
    }))
})
