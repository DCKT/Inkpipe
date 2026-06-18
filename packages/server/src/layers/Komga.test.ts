import { Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { AppConfig } from "@inkpipe/shared"
import { KomgaService, KomgaServiceLive } from "./Komga"
import { ConfigService } from "./Config"

const testConfig: AppConfig = {
  prowlarr: { url: "", apiKey: "" },
  alldebrid: { apiKey: "" },
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
  komga: { url: "http://komga:8080", apiKey: "kk", defaultLibraryId: "lib-1" },
}

function makeLayer(config?: Partial<AppConfig>) {
  return Layer.succeed(ConfigService, {
    loadConfig: Effect.succeed({ ...testConfig, ...config }),
    saveConfig: () => Effect.void,
  } as any)
}

function makeProgram<T>(prog: (svc: any) => Effect.Effect<T, any, any>) {
  return Effect.gen(function* () {
    const svc = yield* KomgaService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(KomgaServiceLive, makeLayer()))) as Effect.Effect<T, unknown, never>
}

const mockLibraries = [
  { id: "lib-1", name: "Manga" },
  { id: "lib-2", name: "Comics" },
]

function mockSeriesPage(content: unknown[], totalPages = 1) {
  return {
    content,
    totalPages,
    totalElements: content.length,
    number: 0,
  }
}

const mockBooks = [
  { id: "b1", name: "Chapter 1", number: 1, created: "2024-01-01", size: "10MB", media: { pagesCount: 42, mediaType: "application/epub+zip" }, metadata: { title: "Chapter 1", number: "1" } },
  { id: "b2", name: "Chapter 2", number: 2, created: "2024-01-02", size: "12MB", media: { pagesCount: 38, mediaType: "application/epub+zip" }, metadata: { title: "Chapter 2", number: "2" } },
]

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {}) as any
  ;(globalThis as any).fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("KomgaService", () => {
  describe("listLibraries", () => {
    it("fetches and returns libraries", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockLibraries,
      })

      const result = await Effect.runPromise(makeProgram((svc) => svc.listLibraries)) as any

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe("lib-1")
      expect(result[0].name).toBe("Manga")
    })

    it("calls the correct Komga API URL", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => [],
      })

      await Effect.runPromise(makeProgram((svc) => svc.listLibraries) as any)

      const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(url).toContain("komga:8080/api/v1/libraries")
    })
  })

  describe("listAllSeries", () => {
    it("fetches series with pagination", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () =>
          mockSeriesPage([
            { id: "s1", name: "Series 1", libraryId: "lib-1" },
          ]),
      })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.listAllSeries("lib-1")),
      ) as any

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe("Series 1")
    })

    it("handles multiple pages", async () => {
      const page1 = mockSeriesPage(
        Array.from({ length: 3 }, (_, i) => ({ id: `s${i}`, name: `Series ${i}`, libraryId: "lib-1" })),
        2,
      )
      const page2 = mockSeriesPage(
        [{ id: "s3", name: "Series 3", libraryId: "lib-1" }],
        2,
      )

      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ ok: true, json: async () => page1 })
        .mockResolvedValueOnce({ ok: true, json: async () => page2 })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.listAllSeries()),
      ) as any

      expect(result).toHaveLength(4)
    })

    it("fetches all series when no libraryId provided", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockSeriesPage([{ id: "s-all", name: "All Series", libraryId: "lib-1" }]),
      })

      const result = await Effect.runPromise(makeProgram((svc) => svc.listAllSeries())) as any

      expect(result).toHaveLength(1)
      const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(url).toContain("komga:8080/api/v1/series/list")
    })
  })

  describe("getSeriesThumbnail", () => {
    it("fetches thumbnail and returns base64 data URI", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer,
      })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.getSeriesThumbnail("s1")),
      ) as any

      expect(result).toMatch(/^data:image\/jpeg;base64,/)
    })
  })

  describe("getBooksForSeries", () => {
    it("fetches books for a given series", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ content: mockBooks, totalPages: 1, totalElements: 2, number: 0 }),
      })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.getBooksForSeries("s1")),
      ) as any

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe("Chapter 1")
    })
  })

  describe("error handling", () => {
    it("fails with KomgaNotConfigured when config is missing", async () => {
      await expect(
        Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* KomgaService
            return yield* svc.listLibraries
          }).pipe(
            Effect.provide(
              Layer.provide(
                KomgaServiceLive,
                Layer.succeed(ConfigService, {
                  loadConfig: Effect.succeed({
                    ...testConfig,
                    komga: { url: "", apiKey: "", defaultLibraryId: "" },
                  }),
                  saveConfig: () => Effect.void,
                } as any),
              ),
            ),
          ) as any,
        ),
      ).rejects.toThrow("Komga is not configured")
    })

    it("fails with KomgaHttpError on HTTP error", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNREFUSED"))

      await expect(
        Effect.runPromise(makeProgram((svc) => svc.listLibraries) as any),
      ).rejects.toThrow("ECONNREFUSED")
    })

    it("fails with KomgaHttpError on non-OK response", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      })

      await expect(
        Effect.runPromise(makeProgram((svc) => svc.listLibraries) as any),
      ).rejects.toThrow("403")
    })
  })
})
