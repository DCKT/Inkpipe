import { Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { AppConfig, DebridFile, UploadResult } from "@inkpipe/shared"
import { AllDebridService, AllDebridServiceLive } from "./AllDebrid"
import { ConfigService } from "./Config"

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
  } as any)
}

function makeProgram<T>(prog: (svc: any) => Effect.Effect<T, any, any>) {
  return Effect.gen(function* () {
    const svc = yield* AllDebridService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(AllDebridServiceLive, makeLayer()))) as Effect.Effect<T, unknown, never>
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
    it("uploads a magnet URI", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockMagnetUploadResponse(123, true),
      })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.uploadMagnet("magnet:?xt=urn:btih:abc123")),
      ) as UploadResult

      expect(result.id).toBe(123)
      expect(result.ready).toBe(true)
      const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(url).toContain("v4/magnet/upload")
      expect(url).toContain("magnets=magnet")
    })

    it("uploads a torrent URL", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(1024),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { files: [{ id: 456, ready: false }] } }),
        })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.uploadMagnet("http://example.com/file.torrent")),
      ) as UploadResult

      expect(result.id).toBe(456)
      expect(result.ready).toBe(false)
      expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    })

    it("fails with MagnetUploadError when API returns error", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { magnets: [{ id: 1, ready: false, error: { code: "TOO_BIG", message: "File too large" } }] },
        }),
      })

      await expect(
        Effect.runPromise(makeProgram((svc) => svc.uploadMagnet("magnet:?xt=urn:btih:abc"))),
      ).rejects.toThrow("File too large")
    })
  })

  describe("getMagnetStatus", () => {
    it("returns ready:true when statusCode is 4", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockMagnetStatusResponse(4, "Ready"),
      })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.getMagnetStatus(123)),
      ) as any

      expect(result.ready).toBe(true)
      expect(result.statusCode).toBe(4)
      expect(result.status).toBe("Ready")
    })

    it("returns ready:false when statusCode is not 4", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockMagnetStatusResponse(1, "Downloading"),
      })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.getMagnetStatus(123)),
      ) as any

      expect(result.ready).toBe(false)
      expect(result.statusCode).toBe(1)
    })

    it("returns waiting when magnet not yet in response", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ data: {} }),
      })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.getMagnetStatus(123)),
      ) as any

      expect(result.ready).toBe(false)
      expect(result.statusCode).toBe(0)
      expect(result.status).toBe("Waiting")
    })
  })

  describe("getMagnetFiles", () => {
    it("flattens a flat file tree", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () =>
          mockMagnetFilesResponse([
            { n: "file1.cbz", s: 1000, l: "https://alldebrid.com/f/1" },
            { n: "file2.cbz", s: 2000, l: "https://alldebrid.com/f/2" },
          ]),
      })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.getMagnetFiles(123)),
      ) as any

      expect(result).toHaveLength(2)
      expect(result[0].filename).toBe("file1.cbz")
      expect(result[0].link).toBe("https://alldebrid.com/f/1")
      expect(result[0].size).toBe(1000)
    })

    it("flattens a nested file tree", async () => {
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

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.getMagnetFiles(123)),
      ) as DebridFile[]

      expect(result).toHaveLength(2)
      const filenames = result.map((f) => f.filename)
      expect(filenames).toContain("nested.cbz")
      expect(filenames).toContain("root.cbz")
    })

    it("handles empty files array", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockMagnetFilesResponse([]),
      })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.getMagnetFiles(123)),
      ) as any

      expect(result).toEqual([])
    })
  })

  describe("unlockLink", () => {
    it("unlocks a link and returns download URL", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => mockUnlockResponse("comic.cbz", 5000),
      })

      const result = await Effect.runPromise(
        makeProgram((svc) => svc.unlockLink("https://alldebrid.com/f/abc")),
      ) as any

      expect(result.url).toBe("https://cdn.example.com/comic.cbz")
      expect(result.filename).toBe("comic.cbz")
      expect(result.size).toBe(5000)
    })
  })

  describe("deleteMagnet", () => {
    it("calls the delete endpoint", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })

      await Effect.runPromise(makeProgram((svc) => svc.deleteMagnet(123)) as any)

      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
      const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(url).toContain("v4/magnet/delete")
      expect(url).toContain("id=123")
    })
  })

  describe("downloadFile", () => {
    it("downloads a file and calls onProgress", async () => {
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

      await Effect.runPromise(
        makeProgram((svc) =>
          svc.downloadFile("https://cdn.example.com/file.cbz", "/tmp/file.cbz", (rec: number, tot: number) => {
            received = rec
            total = tot
          }),
        ) as any,
      )

      expect((globalThis as any).Bun.write).toHaveBeenCalled()
      expect(received).toBe(4)
      expect(total).toBe(4)
    })

    it("fails with AllDebridHttpError on non-OK response", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 404,
      })

      await expect(
        Effect.runPromise(makeProgram((svc) => svc.downloadFile("url", "/tmp/file.cbz")) as any),
      ).rejects.toThrow("Download failed")
    })
  })

  describe("error handling", () => {
    it("fails with AllDebridNotConfigured when API key is empty", async () => {
      await expect(
        Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* AllDebridService
            return yield* svc.uploadMagnet("magnet:?test")
          }).pipe(
            Effect.provide(
              Layer.provide(
                AllDebridServiceLive,
                Layer.succeed(ConfigService, {
                  loadConfig: Effect.succeed({
                    ...testConfig,
                    alldebrid: { apiKey: "" },
                  }),
                  saveConfig: () => Effect.void,
                } as any),
              ),
            ),
          ) as any,
        ),
      ).rejects.toThrow("API key not configured")
    })

    it("fails with AllDebridNotConfigured when config load fails", async () => {
      await expect(
        Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* AllDebridService
            return yield* svc.uploadMagnet("magnet:?test")
          }).pipe(
            Effect.provide(
              Layer.provide(
                AllDebridServiceLive,
                Layer.succeed(ConfigService, {
                  loadConfig: Effect.fail(new Error("config error") as any),
                  saveConfig: () => Effect.void,
                } as any),
              ),
            ),
          ) as any,
        ),
      ).rejects.toThrow("config error")
    })

    it("fails with AllDebridHttpError on fetch failure", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"))

      await expect(
        Effect.runPromise(makeProgram((svc) => svc.getMagnetFiles(123)) as any),
      ).rejects.toThrow("Network error")
    })
  })
})
