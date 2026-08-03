import { Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach, layer } from "@effect/vitest"
import type { AppConfig, ProwlarrResult } from "@inkpipe/shared"
import { ProwlarrService, ProwlarrServiceLive } from "./Prowlarr"
import { ConfigService } from "../core/Config"
import { LogServiceLive } from "../core/Log"

const testConfig: AppConfig = {
  prowlarr: { url: "http://localhost:9696", apiKey: "test-key" },
  alldebrid: { apiKey: "test-debrid-key" },
  kcc: {
    dockerImage: "ghcr.io/ciromattia/kcc:latest", profile: "KoBO", format: "Auto",
    mangaStyle: false, webtoon: false, twoPanel: false,
    upscale: true, stretch: false, hq: false, gamma: 1.0,
    cropping: "1", croppingPower: 1.0, forceColor: true,
    forcePng: false, noAutoContrast: false, blackBorders: false,
    whiteBorders: false, splitter: "0", noProcessing: false,
    eraseRainbow: true, coverFill: false, batchSplit: "0",
    targetSize: 0, customWidth: 0, customHeight: 0, noKepub: false,
  },
  copyparty: { url: "", uploadPath: "/", password: "" },
  komga: { url: "", apiKey: "", defaultLibraryId: "" },
}

function makeConfigLayer(config: Partial<AppConfig> = {}) {
  return Layer.succeed(ConfigService, {
    loadConfig: Effect.succeed({ ...testConfig, ...config }),
    saveConfig: () => Effect.void,
  } as any)
}

const TestLayer = Layer.provide(
  ProwlarrServiceLive,
  Layer.merge(LogServiceLive, makeConfigLayer()),
)

const mockProwlarrResults: Record<string, unknown>[] = [
  {
    title: "Naruto T01",
    guid: "g1",
    magnetUrl: "magnet:?xt=urn:btih:abc",
    downloadUrl: null,
    size: 100000,
    seeders: 10,
    indexer: "Nyaa",
    categories: [{ name: "Comics" }],
    publishDate: "2024-06-01T00:00:00Z",
  },
  {
    title: "One Piece v1",
    guid: "g2",
    magnetUrl: null,
    downloadUrl: "http://example.com/torrent.torrent",
    size: 200000,
    seeders: 5,
    indexer: "Nyaa",
    categories: [{ name: "Manga" }, { name: "eBook" }],
    publishDate: "2024-05-15T00:00:00Z",
  },
]

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {}) as any
  ;(globalThis as any).fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("ProwlarrService", () => {
  layer(TestLayer)("search", (it) => {
    it.effect("calls Prowlarr search endpoint with query", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockProwlarrResults,
        })

        const svc = yield* ProwlarrService
        const results = yield* svc.search("naruto")

        expect(globalThis.fetch).toHaveBeenCalledTimes(1)
        const callUrl = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(callUrl).toContain("http://localhost:9696/api/v1/search")
        expect(callUrl).toContain("query=naruto")
        expect(callUrl).toContain("type=search")
        expect(results).toHaveLength(2)
      }))

    it.effect("transforms API response to ProwlarrResult", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockProwlarrResults,
        })

        const svc = yield* ProwlarrService
        const results: ProwlarrResult[] = yield* svc.search("naruto")

        expect(results[0].title).toBe("Naruto T01")
        expect(results[0].guid).toBe("g1")
        expect(results[0].magnetUrl).toBe("magnet:?xt=urn:btih:abc")
        expect(results[0].downloadUrl).toBeNull()
        expect(results[0].size).toBe(100000)
        expect(results[0].seeders).toBe(10)
        expect(results[0].indexer).toBe("Nyaa")
        expect(results[0].categories).toEqual(["Comics"])
        expect(results[0].publishDate).toBe("2024-06-01T00:00:00Z")
      }))

    it.effect("sorts results by publishDate descending", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockProwlarrResults,
        })

        const svc = yield* ProwlarrService
        const results: ProwlarrResult[] = yield* svc.search("test")

        expect(results[0].publishDate).toBe("2024-06-01T00:00:00Z")
        expect(results[1].publishDate).toBe("2024-05-15T00:00:00Z")
      }))

    it.effect("handles items missing magnetUrl and downloadUrl", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => [{
            title: "No URLs", guid: "g3", size: 100, seeders: 0,
            indexer: "idx", categories: [], publishDate: null,
          }],
        })

        const svc = yield* ProwlarrService
        const results: ProwlarrResult[] = yield* svc.search("test")

        expect(results[0].magnetUrl).toBeNull()
        expect(results[0].downloadUrl).toBeNull()
      }))

    it.effect("handles non-array categories gracefully", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => [{
            title: "No Cats", guid: "g4", size: 100, seeders: 0,
            indexer: "idx", categories: "not_an_array", publishDate: null,
          }],
        })

        const svc = yield* ProwlarrService
        const results: ProwlarrResult[] = yield* svc.search("test")

        expect(results[0].categories).toEqual([])
      }))
  })

  layer(TestLayer)("getLatest", (it) => {
    it.effect("calls Prowlarr with category filters", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockProwlarrResults,
        })

        const svc = yield* ProwlarrService
        const results: ProwlarrResult[] = yield* svc.getLatest

        const callUrl = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(callUrl).toContain("categories=8010")
        expect(callUrl).toContain("categories=7030")
        expect(results).toHaveLength(2)
      }))
  })

  describe("error handling", () => {
    it.effect("fails with ProwlarrNotConfigured when config is missing", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          Effect.gen(function* () {
            const svc = yield* ProwlarrService
            return yield* svc.search("test")
          }).pipe(
            Effect.provide(
              Layer.provide(
                ProwlarrServiceLive,
                Layer.merge(
                  LogServiceLive,
                  Layer.succeed(ConfigService, {
                    loadConfig: Effect.fail(new Error("no config") as any),
                    saveConfig: () => Effect.void,
                  } as any),
                ),
              ),
            ),
          ),
        )

        expect(error.message).toContain("no config")
      }))

    it.effect("fails with ProwlarrNotConfigured when url is empty", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          Effect.gen(function* () {
            const svc = yield* ProwlarrService
            return yield* svc.search("test")
          }).pipe(
            Effect.provide(
              Layer.provide(
                ProwlarrServiceLive,
                Layer.merge(
                  LogServiceLive,
                  Layer.succeed(ConfigService, {
                    loadConfig: Effect.succeed({
                      ...testConfig,
                      prowlarr: { url: "", apiKey: "" },
                    }),
                    saveConfig: () => Effect.void,
                  } as any),
                ),
              ),
            ),
          ),
        )

        expect(error.message).toContain("Prowlarr is not configured")
      }))

    it.effect("fails with ProwlarrHttpError when HTTP fails", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Connection refused"))

        const error = yield* Effect.flip(
          Effect.gen(function* () {
            const svc = yield* ProwlarrService
            return yield* svc.search("test")
          }).pipe(Effect.provide(TestLayer)),
        )

        expect(error.message).toContain("Connection refused")
      }))

    it.effect("fails with ProwlarrHttpError on non-OK response", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: false,
          status: 502,
          statusText: "Bad Gateway",
        })

        const error = yield* Effect.flip(
          Effect.gen(function* () {
            const svc = yield* ProwlarrService
            return yield* svc.search("test")
          }).pipe(Effect.provide(TestLayer)),
        )

        expect(error.message).toContain("502")
      }))
  })
})
