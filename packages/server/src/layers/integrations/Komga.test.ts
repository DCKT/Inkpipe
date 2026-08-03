import { Effect, Layer } from "effect"
import { describe, expect, layer, vi, beforeEach, afterEach } from "@effect/vitest"
import type { AppConfig } from "@inkpipe/shared"
import { KomgaService, KomgaServiceLive } from "./Komga"
import { ConfigService } from "../core/Config"
import { LogServiceLive } from "../core/Log"

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

function makeConfigLayer(config?: Partial<AppConfig>) {
  return Layer.succeed(ConfigService, {
    loadConfig: Effect.succeed({ ...testConfig, ...config }),
    saveConfig: () => Effect.void,
  })
}

const TestLayer = Layer.provide(
  KomgaServiceLive,
  Layer.merge(LogServiceLive, makeConfigLayer()),
)

const NotConfiguredLayer = Layer.provide(
  // `KomgaServiceLive` also appears in `TestLayer` above, and both are used
  // within the same `layer()` block's shared MemoMap — without `Layer.fresh`
  // the second build would reuse the already-memoized instance (built with
  // `TestLayer`'s config) instead of picking up this test's empty config.
  Layer.fresh(KomgaServiceLive),
  Layer.merge(
    LogServiceLive,
    makeConfigLayer({ komga: { url: "", apiKey: "", defaultLibraryId: "" } }),
  ),
)

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
  vi.spyOn(console, "log").mockImplementation(() => {})
  ;(globalThis as any).fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

layer(TestLayer)("KomgaService", (it) => {
  describe("listLibraries", () => {
    it.effect("fetches and returns libraries", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockLibraries,
        })

        const svc = yield* KomgaService
        const result = yield* svc.listLibraries

        expect(result).toHaveLength(2)
        expect(result[0]?.id).toBe("lib-1")
        expect(result[0]?.name).toBe("Manga")
      }))

    it.effect("calls the correct Komga API URL", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => [],
        })

        const svc = yield* KomgaService
        yield* svc.listLibraries

        const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(url).toContain("komga:8080/api/v1/libraries")
      }))
  })

  describe("listAllSeries", () => {
    it.effect("fetches series with pagination", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () =>
            mockSeriesPage([
              { id: "s1", name: "Series 1", libraryId: "lib-1" },
            ]),
        })

        const svc = yield* KomgaService
        const result = yield* svc.listAllSeries("lib-1")

        expect(result).toHaveLength(1)
        expect(result[0]?.name).toBe("Series 1")
      }))

    it.effect("handles multiple pages", () =>
      Effect.gen(function* () {
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

        const svc = yield* KomgaService
        const result = yield* svc.listAllSeries()

        expect(result).toHaveLength(4)
      }))

    it.effect("fetches all series when no libraryId provided", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockSeriesPage([{ id: "s-all", name: "All Series", libraryId: "lib-1" }]),
        })

        const svc = yield* KomgaService
        const result = yield* svc.listAllSeries()

        expect(result).toHaveLength(1)
        const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(url).toContain("komga:8080/api/v1/series/list")
      }))
  })

  describe("getSeriesThumbnail", () => {
    it.effect("fetches thumbnail and returns base64 data URI", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff]).buffer,
        })

        const svc = yield* KomgaService
        const result = yield* svc.getSeriesThumbnail("s1")

        expect(result).toMatch(/^data:image\/jpeg;base64,/)
      }))
  })

  describe("getBooksForSeries", () => {
    it.effect("fetches books for a given series", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({ content: mockBooks, totalPages: 1, totalElements: 2, number: 0 }),
        })

        const svc = yield* KomgaService
        const result = yield* svc.getBooksForSeries("s1")

        expect(result).toHaveLength(2)
        expect(result[0]?.name).toBe("Chapter 1")
      }))
  })

  describe("error handling", () => {
    it.effect("fails with KomgaNotConfigured when config is missing", () =>
      Effect.gen(function* () {
        const svc = yield* KomgaService
        const error = yield* Effect.flip(svc.listLibraries)

        expect(error.message).toBe("Komga is not configured")
      }).pipe(Effect.provide(NotConfiguredLayer)))

    it.effect("fails with KomgaHttpError on HTTP error", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNREFUSED"))

        const svc = yield* KomgaService
        const error = yield* Effect.flip(svc.listLibraries)

        expect(error.message).toContain("ECONNREFUSED")
      }))

    it.effect("fails with KomgaHttpError on non-OK response", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: false,
          status: 403,
          text: async () => "Forbidden",
        })

        const svc = yield* KomgaService
        const error = yield* Effect.flip(svc.listLibraries)

        expect(error.message).toContain("403")
      }))
  })
})
