import { Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { AppConfig } from "@inkpipe/shared"
import { CopypartyService, CopypartyServiceLive } from "./Copyparty"
import { ConfigService } from "./Config"
import { LogServiceLive } from "./Log"

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
  copyparty: { url: "http://cp:3923", uploadPath: "/comics", password: "" },
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
    const svc = yield* CopypartyService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(CopypartyServiceLive, Layer.merge(LogServiceLive, makeLayer())))) as Effect.Effect<T, unknown, never>
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {}) as any
  ;(globalThis as any).fetch = vi.fn()
  ;(globalThis as any).Bun = {
    file: vi.fn(() => ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as any).Bun
})

describe("CopypartyService", () => {
  describe("listFolders", () => {
    it("returns empty array when url is not configured", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* CopypartyService
          return yield* svc.listFolders
        }).pipe(
          Effect.provide(
            Layer.provide(
              CopypartyServiceLive,
              Layer.merge(
                LogServiceLive,
                Layer.succeed(ConfigService, {
                  loadConfig: Effect.succeed({
                    ...testConfig,
                    copyparty: { url: "", uploadPath: "/", password: "" },
                  }),
                  saveConfig: () => Effect.void,
                } as any),
              ),
            ),
          ),
        ) as any,
      )

      expect(result).toEqual([])
    })

    it("parses dirs as array of arrays (copyparty ls format)", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ dirs: [["Manga"], ["Comics"]] }),
      })

      const result = await Effect.runPromise(makeProgram((svc) => svc.listFolders)) as any

      expect(result).toEqual(["Manga", "Comics"])
    })

    it("parses dirs with href format (objects with trailing slash)", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ dirs: [{ href: "Series/" }, { href: "Oneshots/" }] }),
      })

      const result = await Effect.runPromise(makeProgram((svc) => svc.listFolders)) as any

      // Trailing slashes are stripped from href values
      expect(result).toEqual(["Series", "Oneshots"])
    })
  })

  describe("uploadFile", () => {
    it("uploads a file to copyparty", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: async () => "OK",
      })

      await Effect.runPromise(
        makeProgram((svc) => svc.uploadFile("/tmp/file.epub", "Manga")) as any,
      )

      const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(url).toContain("cp:3923")
      expect(url).toContain("comics/Manga/file.epub")
      expect(url).not.toContain("pw=")
    })

    it("includes password in URL when configured", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: async () => "OK",
      })

      await Effect.runPromise(
        Effect.gen(function* () {
          const svc = yield* CopypartyService
          return yield* svc.uploadFile("/tmp/file.epub")
        }).pipe(
          Effect.provide(
            Layer.provide(
              CopypartyServiceLive,
              Layer.merge(
                LogServiceLive,
                Layer.succeed(ConfigService, {
                  loadConfig: Effect.succeed({
                    ...testConfig,
                    copyparty: { url: "http://cp:3923", uploadPath: "/", password: "secret" },
                  }),
                  saveConfig: () => Effect.void,
                } as any),
              ),
            ),
          ),
        ) as any,
      )

      const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(url).toContain("pw=secret")
    })
  })

  describe("createFolder", () => {
    it("sends mkdir POST request with multipart body", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: async () => "OK",
      })

      await Effect.runPromise(makeProgram((svc) => svc.createFolder("NewSeries")) as any)

      const opts = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
      expect(opts.method).toBe("POST")
      expect(opts.body).toBeInstanceOf(FormData)
      expect((opts.body as FormData).get("act")).toBe("mkdir")
      expect((opts.body as FormData).get("name")).toBe("NewSeries")
    })

    it("does not set explicit content-type header (let fetch set multipart boundary)", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: async () => "OK",
      })

      await Effect.runPromise(makeProgram((svc) => svc.createFolder("Test")) as any)

      const opts = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
      expect(opts.headers).toBeUndefined()
    })

    it("fails with CopypartyFolderError when name is empty after sanitization", async () => {
      await expect(
        Effect.runPromise(makeProgram((svc) => svc.createFolder("///")) as any),
      ).rejects.toThrow("Folder name is empty")
    })

    it("fails with CopypartyFolderError when name is empty string", async () => {
      await expect(
        Effect.runPromise(makeProgram((svc) => svc.createFolder("")) as any),
      ).rejects.toThrow("Folder name is empty")
    })
  })

  describe("deleteFolder", () => {
    it("sends delete POST request", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: async () => "OK",
      })

      await Effect.runPromise(makeProgram((svc) => svc.deleteFolder("OldSeries")) as any)

      const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(url).toContain("delete")
      expect(url).toContain("OldSeries")

      const opts = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
      expect(opts.method).toBe("POST")
    })

    it("fails with CopypartyFolderError when name is empty after sanitization", async () => {
      await expect(
        Effect.runPromise(makeProgram((svc) => svc.deleteFolder("///")) as any),
      ).rejects.toThrow("Folder name is empty")
    })
  })

  describe("error handling", () => {
    it("fails with CopypartyNotConfigured on upload when URL is empty", async () => {
      await expect(
        Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* CopypartyService
            return yield* svc.uploadFile("/tmp/file.epub")
          }).pipe(
            Effect.provide(
              Layer.provide(
                CopypartyServiceLive,
                Layer.merge(
                  LogServiceLive,
                  Layer.succeed(ConfigService, {
                    loadConfig: Effect.succeed({
                      ...testConfig,
                      copyparty: { url: "", uploadPath: "/", password: "" },
                    }),
                    saveConfig: () => Effect.void,
                  } as any),
                ),
              ),
            ),
          ) as any,
        ),
      ).rejects.toThrow("Copyparty URL not configured")
    })

    it("fails with CopypartyHttpError on fetch failure", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"))

      await expect(
        Effect.runPromise(makeProgram((svc) => svc.listFolders) as any),
      ).rejects.toThrow("Network error")
    })

    it("fails with CopypartyHttpError on non-OK upload response", async () => {
      ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal error",
      })

      await expect(
        Effect.runPromise(makeProgram((svc) => svc.uploadFile("/tmp/file.epub")) as any),
      ).rejects.toThrow("HTTP 500")
    })
  })
})
