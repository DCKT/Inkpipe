import { Effect, Layer } from "effect"
import { describe, it, expect } from "vitest"
import type { ProwlarrResult } from "@inkpipe/shared"
import { searchHandler } from "../routes/search"
import { ProwlarrService } from "../layers/Prowlarr"

const mockResults: ProwlarrResult[] = [
  {
    title: "Naruto T01", guid: "g1", magnetUrl: "magnet:?xt=urn:btih:abc",
    downloadUrl: null, size: 100000, seeders: 10, indexer: "Nyaa",
    categories: ["Comics"], publishDate: "2024-06-01T00:00:00Z",
  },
]

describe("searchHandler", () => {
  it("returns search results as JSON", async () => {
    const layer = Layer.succeed(ProwlarrService, {
      search: () => Effect.succeed(mockResults),
      getLatest: Effect.succeed([]),
    } as any)

    const response = await Effect.runPromise(
      searchHandler("naruto").pipe(Effect.provide(layer)),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body).toEqual(mockResults)
  })

  it("returns 502 with error message on service failure", async () => {
    const layer = Layer.succeed(ProwlarrService, {
      search: () => Effect.fail({ message: "Prowlarr not configured" } as any),
      getLatest: Effect.succeed([]),
    } as any)

    const response = await Effect.runPromise(
      searchHandler("naruto").pipe(Effect.provide(layer)),
    )

    expect(response.status).toBe(502)
    const body = await response.json() as any
    expect(body.error).toBe("Prowlarr not configured")
  })
})
