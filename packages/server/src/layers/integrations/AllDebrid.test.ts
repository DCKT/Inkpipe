import { Context, Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "@effect/vitest"
import type { AppConfig, DebridFile, UploadResult } from "@inkpipe/shared"
import { AllDebridService, AllDebridServiceLive } from "./AllDebrid"
import { ConfigService } from "../core/Config"
import { LogServiceLive } from "../core/Log"

const testConfig: AppConfig = {
  prowlarr: { url: "", apiKey: "" },
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

function makeLayer(config?: Partial<AppConfig>) {
  return Layer.succeed(ConfigService, {
    loadConfig: Effect.succeed({ ...testConfig, ...config }),
    saveConfig: () => Effect.void,
  })
}

function makeProgram<T, E>(prog: (svc: Context.Service.Shape<typeof AllDebridService>) => Effect.Effect<T, E>) {
  return Effect.gen(function* () {
    const svc = yield* AllDebridService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(AllDebridServiceLive, Layer.merge(LogServiceLive, makeLayer()))))
}

function mockMagnetUploadResponse(id: number, ready = true) {
  return { data: { magnets: [{ id, ready }] } }
}

function mockMagnetStatusResponse(statusCode: number, status: string) {
  return { data: { magnets: [{ id: 1, filename: "test", statusCode, status }] } }
}

function mockMagnetFilesResponse(files: { n: string; s?: number; l?: string; e?: { n: string; s?: number; l?: string }[] }[]) {
  return { data: { magnets: [{ files }] } }
}

function mockUnlockResponse(filename: string, size = 1000) {
  return { data: { link: `https://cdn.example.com/${filename}`, filename, filesize: size } }
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {}) as any
  vi.spyOn(console, "error").mockImplementation(() => {}) as any
  ;(globalThis as any).fetch = vi.fn()
  ;(globalThis as any).Bun = {
    write: vi.fn(() => Promise.resolve()),
    file: vi.fn(() => ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as any).Bun
})

describe("AllDebridService", () => {
  describe("uploadMagnet", () => {
    it.effect("uploads a magnet URI", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockMagnetUploadResponse(123, true),
        })

        const result: UploadResult = yield* makeProgram((svc) => svc.uploadMagnet("magnet:?xt=urn:btih:abc123"))

        expect(result.id).toBe(123)
        expect(result.ready).toBe(true)
        const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(url).toContain("v4/magnet/upload")
        expect(url).toContain("magnets=magnet")
      }))

    it.effect("uploads a torrent URL", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>)
          .mockResolvedValueOnce({
            ok: true,
            arrayBuffer: async () => new ArrayBuffer(1024),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: { files: [{ id: 456, ready: false }] } }),
          })

        const result: UploadResult = yield* makeProgram((svc) => svc.uploadMagnet("http://example.com/file.torrent"))

        expect(result.id).toBe(456)
        expect(result.ready).toBe(false)
        expect(globalThis.fetch).toHaveBeenCalledTimes(2)
      }))

    it.effect("fails with MagnetUploadError when API returns error", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({
            data: { magnets: [{ id: 1, ready: false, error: { code: "TOO_BIG", message: "File too large" } }] },
          }),
        })

        const error = yield* Effect.flip(makeProgram((svc) => svc.uploadMagnet("magnet:?xt=urn:btih:abc")))

        expect(error.message).toContain("File too large")
      }))
  })

  describe("getMagnetStatus", () => {
    it.effect("returns ready:true when statusCode is 4", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockMagnetStatusResponse(4, "Ready"),
        })

        const result = yield* makeProgram((svc) => svc.getMagnetStatus(123))

        expect(result.ready).toBe(true)
        expect(result.statusCode).toBe(4)
        expect(result.status).toBe("Ready")
      }))

    it.effect("returns ready:false when statusCode is not 4", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockMagnetStatusResponse(1, "Downloading"),
        })

        const result = yield* makeProgram((svc) => svc.getMagnetStatus(123))

        expect(result.ready).toBe(false)
        expect(result.statusCode).toBe(1)
      }))

    it.effect("returns waiting when magnet not yet in response", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({ data: {} }),
        })

        const result = yield* makeProgram((svc) => svc.getMagnetStatus(123))

        expect(result.ready).toBe(false)
        expect(result.statusCode).toBe(0)
        expect(result.status).toBe("Waiting")
      }))
  })

  describe("getMagnetFiles", () => {
    it.effect("flattens a flat file tree", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () =>
            mockMagnetFilesResponse([
              { n: "file1.cbz", s: 1000, l: "https://alldebrid.com/f/1" },
              { n: "file2.cbz", s: 2000, l: "https://alldebrid.com/f/2" },
            ]),
        })

        const result: DebridFile[] = yield* makeProgram((svc) => svc.getMagnetFiles(123))

        expect(result).toHaveLength(2)
        expect(result[0].filename).toBe("file1.cbz")
        expect(result[0].link).toBe("https://alldebrid.com/f/1")
        expect(result[0].size).toBe(1000)
      }))

    it.effect("flattens a nested file tree", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () =>
            mockMagnetFilesResponse([
              {
                n: "folder",
                e: [
                  { n: "nested.cbz", s: 500, l: "https://alldebrid.com/f/n1" },
                ],
              },
              { n: "root.cbz", s: 300, l: "https://alldebrid.com/f/r1" },
            ]),
        })

        const result: DebridFile[] = yield* makeProgram((svc) => svc.getMagnetFiles(123))

        expect(result).toHaveLength(2)
        const filenames = result.map((f) => f.filename)
        expect(filenames).toContain("nested.cbz")
        expect(filenames).toContain("root.cbz")
      }))

    it.effect("handles empty files array", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockMagnetFilesResponse([]),
        })

        const result: DebridFile[] = yield* makeProgram((svc) => svc.getMagnetFiles(123))

        expect(result).toEqual([])
      }))
  })

  describe("unlockLink", () => {
    it.effect("unlocks a link and returns download URL", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => mockUnlockResponse("comic.cbz", 5000),
        })

        const result = yield* makeProgram((svc) => svc.unlockLink("https://alldebrid.com/f/abc"))

        expect(result.url).toBe("https://cdn.example.com/comic.cbz")
        expect(result.filename).toBe("comic.cbz")
        expect(result.size).toBe(5000)
      }))
  })

  describe("deleteMagnet", () => {
    it.effect("calls the delete endpoint", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

        yield* makeProgram((svc) => svc.deleteMagnet(123))

        expect(globalThis.fetch).toHaveBeenCalledTimes(1)
        const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(url).toContain("v4/magnet/delete")
        expect(url).toContain("id=123")
      }))
  })

  describe("downloadFile", () => {
    it.effect("downloads a file and calls onProgress", () =>
      Effect.gen(function* () {
        const content = new Uint8Array([1, 2, 3, 4])
        let received = 0
        let total = 0

        const mockReader = {
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: content })
            .mockResolvedValueOnce({ done: true, value: undefined }),
        }

        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          headers: {
            get: (name: string) => name === "content-length" ? "4" : null,
          },
          body: { getReader: () => mockReader },
        })

        yield* makeProgram((svc) =>
          svc.downloadFile("https://cdn.example.com/file.cbz", "/tmp/file.cbz", (rec: number, tot: number) => {
            received = rec
            total = tot
          }),
        )

        expect((globalThis as any).Bun.write).toHaveBeenCalled()
        expect(received).toBe(4)
        expect(total).toBe(4)
      }))

    it.effect("fails with AllDebridHttpError on non-OK response", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: false,
          status: 404,
        })

        const error = yield* Effect.flip(makeProgram((svc) => svc.downloadFile("url", "/tmp/file.cbz")))

        expect(error.message).toContain("Download failed")
      }))
  })

  describe("error handling", () => {
    it.effect("fails with AllDebridNotConfigured when API key is empty", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const svc = yield* AllDebridService
          return yield* svc.uploadMagnet("magnet:?test")
        }).pipe(
          Effect.provide(
            Layer.provide(
              AllDebridServiceLive,
              Layer.merge(
                LogServiceLive,
                Layer.succeed(ConfigService, {
                  loadConfig: Effect.succeed({
                    ...testConfig,
                    alldebrid: { apiKey: "" },
                  }),
                  saveConfig: () => Effect.void,
                }),
              ),
            ),
          ),
        )

        const error = yield* Effect.flip(program)

        expect(error.message).toContain("API key not configured")
      }))

    it.effect("fails with AllDebridNotConfigured when config load fails", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
          const svc = yield* AllDebridService
          return yield* svc.uploadMagnet("magnet:?test")
        }).pipe(
          Effect.provide(
            Layer.provide(
              AllDebridServiceLive,
              Layer.merge(
                LogServiceLive,
                Layer.succeed(ConfigService, {
                  loadConfig: Effect.fail(new Error("config error") as any),
                  saveConfig: () => Effect.void,
                }),
              ),
            ),
          ),
        )

        const error = yield* Effect.flip(program)

        expect(error.message).toContain("config error")
      }))

    it.effect("fails with AllDebridHttpError on fetch failure", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"))

        const error = yield* Effect.flip(makeProgram((svc) => svc.getMagnetFiles(123)))

        expect(error.message).toContain("Network error")
      }))
  })
})
