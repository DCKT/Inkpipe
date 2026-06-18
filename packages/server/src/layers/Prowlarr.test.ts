import { Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { AppConfig, ProwlarrResult } from "@inkpipe/shared"
import { ProwlarrService, ProwlarrServiceLive } from "./Prowlarr"
import { ConfigService } from "./Config"

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

function makeProwlarrProgram(prog: (svc: any) => Effect.Effect<any, any, any>) {
  return Effect.gen(function* () {
    const svc = yield* ProwlarrService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(ProwlarrServiceLive, makeConfigLayer()))) as Effect.Effect<any, unknown, never>
}

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
  describe("search", () => {
    it("calls Prowlarr search endpoint with query", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockProwlarrResults,
      })

      const results = await Effect.runPromise(
        makeProwlarrProgram((svc) => svc.search("naruto")),
      ) as any

      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      const callUrl = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(callUrl).toContain("http://localhost:9696/api/v1/search")
      expect(callUrl).toContain("query=naruto")
      expect(callUrl).toContain("type=search")
      expect(results).toHaveLength(2)
    })

    it("transforms API response to ProwlarrResult", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockProwlarrResults,
      })

      const results = await Effect.runPromise(
        makeProwlarrProgram((svc) => svc.search("naruto")),
      ) as ProwlarrResult[]

      expect(results[0].title).toBe("Naruto T01")
      expect(results[0].guid).toBe("g1")
      expect(results[0].magnetUrl).toBe("magnet:?xt=urn:btih:abc")
      expect(results[0].downloadUrl).toBeNull()
      expect(results[0].size).toBe(100000)
      expect(results[0].seeders).toBe(10)
      expect(results[0].indexer).toBe("Nyaa")
      expect(results[0].categories).toEqual(["Comics"])
      expect(results[0].publishDate).toBe("2024-06-01T00:00:00Z")
    })

    it("sorts results by publishDate descending", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockProwlarrResults,
      })

      const results = await Effect.runPromise(
        makeProwlarrProgram((svc) => svc.search("test")),
      ) as ProwlarrResult[]

      expect(results[0].publishDate).toBe("2024-06-01T00:00:00Z")
      expect(results[1].publishDate).toBe("2024-05-15T00:00:00Z")
    })

    it("handles items missing magnetUrl and downloadUrl", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => [{
          title: "No URLs", guid: "g3", size: 100, seeders: 0,
          indexer: "idx", categories: [], publishDate: null,
        }],
      })

      const results = await Effect.runPromise(
        makeProwlarrProgram((svc) => svc.search("test")),
      ) as ProwlarrResult[]

      expect(results[0].magnetUrl).toBeNull()
      expect(results[0].downloadUrl).toBeNull()
    })

    it("handles non-array categories gracefully", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => [{
          title: "No Cats", guid: "g4", size: 100, seeders: 0,
          indexer: "idx", categories: "not_an_array", publishDate: null,
        }],
      })

      const results = await Effect.runPromise(
        makeProwlarrProgram((svc) => svc.search("test")),
      ) as ProwlarrResult[]

      expect(results[0].categories).toEqual([])
    })
  })

  describe("getLatest", () => {
    it("calls Prowlarr with category filters", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockProwlarrResults,
      })

      const results = await Effect.runPromise(
        makeProwlarrProgram((svc) => svc.getLatest),
      ) as ProwlarrResult[]

      const callUrl = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(callUrl).toContain("categories=8010")
      expect(callUrl).toContain("categories=7030")
      expect(results).toHaveLength(2)
    })
  })

  describe("error handling", () => {
    it("fails with ProwlarrNotConfigured when config is missing", async () => {
      await expect(
        Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* ProwlarrService
            return yield* svc.search("test")
          }).pipe(
            Effect.provide(
              Layer.provide(
                ProwlarrServiceLive,
                Layer.succeed(ConfigService, {
                  loadConfig: Effect.fail(new Error("no config") as any),
                  saveConfig: () => Effect.void,
                } as any),
              ),
            ),
          ) as any,
        ),
      ).rejects.toThrow("no config")
    })

    it("fails with ProwlarrNotConfigured when url is empty", async () => {
      await expect(
        Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* ProwlarrService
            return yield* svc.search("test")
          }).pipe(
            Effect.provide(
              Layer.provide(
                ProwlarrServiceLive,
                Layer.succeed(ConfigService, {
                  loadConfig: Effect.succeed({
                    ...testConfig,
                    prowlarr: { url: "", apiKey: "" },
                  }),
                  saveConfig: () => Effect.void,
                } as any),
              ),
            ),
          ) as any,
        ),
      ).rejects.toThrow("Prowlarr is not configured")
    })

    it("fails with ProwlarrHttpError when HTTP fails", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Connection refused"))

      await expect(
        Effect.runPromise(makeProwlarrProgram((svc) => svc.search("test"))),
      ).rejects.toThrow("Connection refused")
    })

    it("fails with ProwlarrHttpError on non-OK response", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
      })

      await expect(
        Effect.runPromise(makeProwlarrProgram((svc) => svc.search("test"))),
      ).rejects.toThrow("502")
    })
  })
})
