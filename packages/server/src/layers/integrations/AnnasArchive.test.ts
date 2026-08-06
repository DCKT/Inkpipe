import { Context, Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "@effect/vitest"
import type { AppConfig } from "@inkpipe/shared"
import { AnnasArchiveService, AnnasArchiveServiceLive } from "./AnnasArchive"
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
  komga: { url: "", apiKey: "", defaultLibraryId: "" },
  annasArchive: { apiKey: "test-aa-key", baseUrl: "https://annas-archive.gl" },
}

function makeLayer(config?: Partial<AppConfig>) {
  return Layer.succeed(ConfigService, {
    loadConfig: Effect.succeed({ ...testConfig, ...config }),
    saveConfig: () => Effect.void,
  })
}

function makeProgram<T, E>(prog: (svc: Context.Service.Shape<typeof AnnasArchiveService>) => Effect.Effect<T, E>, config?: Partial<AppConfig>) {
  return Effect.gen(function* () {
    const svc = yield* AnnasArchiveService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(AnnasArchiveServiceLive, Layer.merge(LogServiceLive, makeLayer(config)))))
}

const searchResultsHtml = `
<html><body>
  <div class="flex pt-3 pb-3 border-b">
    <img class="w-full h-full object-cover" src="https://covers.example.com/naruto.jpg" alt="" />
    <a class="js-vim-focus" href="/md5/aaaa1111">Naruto Vol. 1</a>
    <a href="/md5/aaaa1111">Naruto Vol. 1</a>
    <a href="/search?q=author:masashi">
      <span class="icon-[mdi--user-edit]"></span>
      Masashi Kishimoto
    </a>
    <div class="text-gray-800 font-semibold text-sm">
      EPUB · 6.4MB · English [en] · 2003
    </div>
  </div>
  <div class="flex pt-3 pb-3 border-b">
    <img class="w-full h-full object-cover" src="" alt="" />
    <a class="js-vim-focus" href="/md5/bbbb2222">One Piece Vol. 1</a>
    <a href="/md5/bbbb2222">One Piece Vol. 1</a>
    <div class="text-gray-800 font-semibold text-sm">
      PDF · 12.1MB · Japanese [ja]
    </div>
  </div>
</body></html>
`

const originalBunWrite = Bun.write

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {}) as any
  ;(globalThis as any).fetch = vi.fn()
  Bun.write = vi.fn(() => Promise.resolve(0)) as any
})

afterEach(() => {
  vi.restoreAllMocks()
  Bun.write = originalBunWrite
})

describe("AnnasArchiveService", () => {
  describe("search", () => {
    it.effect("scrapes search results from the HTML search page", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          text: async () => searchResultsHtml,
        })

        const results = yield* makeProgram((svc) => svc.search("naruto"))

        expect(globalThis.fetch).toHaveBeenCalledTimes(1)
        const callUrl = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(callUrl).toContain("/search")
        expect(callUrl).toContain("q=naruto")

        expect(results).toHaveLength(2)
        expect(results[0]).toEqual({
          md5: "aaaa1111",
          title: "Naruto Vol. 1",
          author: "Masashi Kishimoto",
          extension: "epub",
          size: "6.4MB",
          language: "English [en]",
          coverUrl: "https://covers.example.com/naruto.jpg",
        })
        expect(results[1]).toEqual({
          md5: "bbbb2222",
          title: "One Piece Vol. 1",
          author: null,
          extension: "pdf",
          size: "12.1MB",
          language: "Japanese [ja]",
          coverUrl: null,
        })
      }))

    it.effect("skips rows missing an md5 link or title", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          text: async () => `
            <div class="flex pt-3 pb-3 border-b">
              <div class="text-gray-800 font-semibold text-sm">EPUB · 1MB</div>
            </div>
          `,
        })

        const results = yield* makeProgram((svc) => svc.search("nothing"))

        expect(results).toEqual([])
      }))

    it.effect("sorts French results to the front regardless of HTML order", () =>
      Effect.gen(function* () {
        const html = `
          <html><body>
            <div class="flex pt-3 pb-3 border-b">
              <a class="js-vim-focus" href="/md5/en1">English Book</a>
              <div class="text-gray-800 font-semibold text-sm">EPUB · 1MB · English [en]</div>
            </div>
            <div class="flex pt-3 pb-3 border-b">
              <a class="js-vim-focus" href="/md5/fr1">Livre Français</a>
              <div class="text-gray-800 font-semibold text-sm">EPUB · 1MB · French [fr]</div>
            </div>
          </body></html>
        `
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          text: async () => html,
        })

        const results = yield* makeProgram((svc) => svc.search("test"))

        expect(results.map((r) => r.md5)).toEqual(["fr1", "en1"])
      }))

    it.effect("does not require an API key", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          text: async () => searchResultsHtml,
        })

        const results = yield* makeProgram(
          (svc) => svc.search("naruto"),
          { annasArchive: { apiKey: "", baseUrl: "https://annas-archive.gl" } },
        )

        expect(results).toHaveLength(2)
      }))

    it.effect("fails with AnnasArchiveHttpError on non-OK response after exhausting all mirrors", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
        })

        const error = yield* Effect.flip(makeProgram((svc) => svc.search("test")))

        expect(error.message).toContain("503")
        // 3 known mirrors, never more
        expect(globalThis.fetch).toHaveBeenCalledTimes(3)
      }))

    it.effect("fails with AnnasArchiveHttpError on network failure", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Connection refused"))

        const error = yield* Effect.flip(makeProgram((svc) => svc.search("test")))

        expect(error.message).toContain("Connection refused")
        expect(globalThis.fetch).toHaveBeenCalledTimes(3)
      }))

    it.effect("falls back to the next known mirror when the configured base URL is unreachable", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>)
          .mockRejectedValueOnce(new TypeError("Was there a typo in the url or port?"))
          .mockResolvedValueOnce({ ok: true, text: async () => searchResultsHtml })

        const results = yield* makeProgram((svc) => svc.search("naruto"))

        expect(results).toHaveLength(2)
        expect(globalThis.fetch).toHaveBeenCalledTimes(2)
        const firstUrl = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        const secondUrl = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[1][0] as string
        expect(firstUrl).toContain("annas-archive.gl")
        expect(secondUrl).toContain("annas-archive.pk")
      }))

    it.effect("never makes more than 3 mirror attempts", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"))

        yield* Effect.flip(makeProgram((svc) => svc.search("test")))

        expect(globalThis.fetch).toHaveBeenCalledTimes(3)
      }))
  })

  describe("getDownloadUrl", () => {
    it.effect("returns the download_url from a successful response", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          text: async () => JSON.stringify({ download_url: "https://cdn.example.com/book.epub" }),
        })

        const url = yield* makeProgram((svc) => svc.getDownloadUrl("aaaa1111"))

        expect(url).toBe("https://cdn.example.com/book.epub")
        const callUrl = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(callUrl).toContain("fast_download.json")
        expect(callUrl).toContain("md5=aaaa1111")
        expect(callUrl).toContain("key=test-aa-key")
      }))

    it.effect("fails with AnnasArchiveNotConfigured when API key is empty", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          makeProgram((svc) => svc.getDownloadUrl("aaaa1111"), {
            annasArchive: { apiKey: "", baseUrl: "https://annas-archive.gl" },
          }),
        )

        expect(error.message).toContain("not configured")
      }))

    it.effect("fails when the response body contains an error field", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          text: async () => JSON.stringify({ error: "md5 not found" }),
        })

        const error = yield* Effect.flip(makeProgram((svc) => svc.getDownloadUrl("unknown")))

        expect(error.message).toContain("md5 not found")
      }))

    it.effect("surfaces a membership error on no_membership response without retrying other mirrors", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          text: async () => "no_membership",
        })

        const error = yield* Effect.flip(makeProgram((svc) => svc.getDownloadUrl("aaaa1111")))

        expect(error.message).toContain("no active membership")
        // Same key, so every mirror would fail identically — must not waste attempts retrying.
        expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      }))

    it.effect("surfaces an invalid-key error without retrying other mirrors", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          text: async () => "invalid key",
        })

        const error = yield* Effect.flip(makeProgram((svc) => svc.getDownloadUrl("aaaa1111")))

        expect(error.message).toContain("Invalid Anna's Archive API key")
        expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      }))

    it.effect("falls back to the next known mirror on a connectivity failure", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>)
          .mockRejectedValueOnce(new TypeError("Was there a typo in the url or port?"))
          .mockResolvedValueOnce({
            ok: true,
            text: async () => JSON.stringify({ download_url: "https://cdn.example.com/book.epub" }),
          })

        const url = yield* makeProgram((svc) => svc.getDownloadUrl("aaaa1111"))

        expect(url).toBe("https://cdn.example.com/book.epub")
        expect(globalThis.fetch).toHaveBeenCalledTimes(2)
      }))

    it.effect("never makes more than 3 mirror attempts", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("down"))

        yield* Effect.flip(makeProgram((svc) => svc.getDownloadUrl("aaaa1111")))

        expect(globalThis.fetch).toHaveBeenCalledTimes(3)
      }))
  })

  describe("downloadFile", () => {
    it.effect("downloads a file and calls onProgress", () =>
      Effect.gen(function* () {
        const content = new Uint8Array([1, 2, 3, 4])
        const mockReader = {
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: content })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }

        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          headers: { get: (name: string) => (name === "content-length" ? "4" : null) },
          body: { getReader: () => mockReader },
        })

        let received = 0
        let total = 0
        yield* makeProgram((svc) =>
          svc.downloadFile("https://cdn.example.com/book.epub", "/tmp/book.epub", (rec, tot) => {
            received = rec
            total = tot
          }),
        )

        expect(Bun.write).toHaveBeenCalled()
        expect(received).toBe(4)
        expect(total).toBe(4)
      }))

    it.effect("fails with AnnasArchiveDownloadError on non-OK response", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: false,
          status: 404,
        })

        const error = yield* Effect.flip(
          makeProgram((svc) => svc.downloadFile("https://cdn.example.com/missing.epub", "/tmp/missing.epub")),
        )

        expect(error.message).toContain("Download failed")
      }))
  })
})
