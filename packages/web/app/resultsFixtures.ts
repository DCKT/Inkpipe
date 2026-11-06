// Test-only fixtures for result lists.
import { type KomgaSeries, type ProwlarrResult, ProwlarrResultSchema } from "@inkpipe/shared"
import { Option, Schema } from "effect"

const decodeResult = Schema.decodeUnknownOption(ProwlarrResultSchema)

export const makeResult = (
  overrides: Partial<Record<keyof ProwlarrResult, unknown>> = {},
): ProwlarrResult =>
  Option.getOrThrowWith(
    decodeResult({
      title: "Berserk v01 [Group]",
      guid: "g1",
      magnetUrl: "magnet:?xt=urn:btih:abc",
      downloadUrl: null,
      size: 52_428_800,
      seeders: 12,
      indexer: "Nyaa",
      categories: ["Books"],
      publishDate: "2026-01-01T00:00:00.000Z",
      ...overrides,
    }),
    () => new globalThis.Error("invalid result fixture"),
  )

export const makeSeries = (overrides: Partial<KomgaSeries> = {}): KomgaSeries => ({
  id: "s1",
  name: "Berserk",
  booksCount: 41,
  metadata: { status: "ONGOING", title: "Berserk" },
  ...overrides,
})
