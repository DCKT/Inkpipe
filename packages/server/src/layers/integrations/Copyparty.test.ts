import { Context, Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "@effect/vitest"
import type { AppConfig } from "@inkpipe/shared"
import { CopypartyService, CopypartyServiceLive } from "./Copyparty"
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
  copyparty: { url: "http://cp:3923", uploadPath: "/comics", password: "" },
  komga: { url: "", apiKey: "", defaultLibraryId: "" },
  annasArchive: { apiKey: "", baseUrl: "https://annas-archive.org" },
}

function makeLayer(config?: Partial<AppConfig>) {
  return Layer.succeed(ConfigService, {
    loadConfig: Effect.succeed({ ...testConfig, ...config }),
    saveConfig: () => Effect.void,
  })
}

function makeProgram<T, E>(prog: (svc: Context.Service.Shape<typeof CopypartyService>) => Effect.Effect<T, E>) {
  return Effect.gen(function* () {
    const svc = yield* CopypartyService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(CopypartyServiceLive, Layer.merge(LogServiceLive, makeLayer()))))
}

const originalBunFile = Bun.file

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {}) as any
  ;(globalThis as any).fetch = vi.fn()
  Bun.file = vi.fn(() => ({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })) as any
})

afterEach(() => {
  vi.restoreAllMocks()
  Bun.file = originalBunFile
})

describe("CopypartyService", () => {
  describe("listFolders", () => {
    it.effect("returns empty array when url is not configured", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
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
                }),
              ),
            ),
          ),
        )

        const result = yield* program

        expect(result).toEqual([])
      }))

    it.effect("parses dirs as array of arrays (copyparty ls format)", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({ dirs: [["Manga"], ["Comics"]] }),
        })

        const result = yield* makeProgram((svc) => svc.listFolders)

        expect(result).toEqual(["Manga", "Comics"])
      }))

    it.effect("parses dirs with href format (objects with trailing slash)", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          json: async () => ({ dirs: [{ href: "Series/" }, { href: "Oneshots/" }] }),
        })

        const result = yield* makeProgram((svc) => svc.listFolders)

        // Trailing slashes are stripped from href values
        expect(result).toEqual(["Series", "Oneshots"])
      }))
  })

  describe("uploadFile", () => {
    it.effect("uploads a file to copyparty", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          text: async () => "OK",
        })

        yield* makeProgram((svc) => svc.uploadFile("/tmp/file.epub", "Manga"))

        const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(url).toContain("cp:3923")
        expect(url).toContain("comics/Manga/file.epub")
        expect(url).not.toContain("pw=")
      }))

    it.effect("includes password in URL when configured", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          text: async () => "OK",
        })

        const program = Effect.gen(function* () {
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
                }),
              ),
            ),
          ),
        )

        yield* program

        const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(url).toContain("pw=secret")
      }))
  })

  describe("createFolder", () => {
    it.effect("sends mkdir POST request with multipart body", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          text: async () => "OK",
        })

        yield* makeProgram((svc) => svc.createFolder("NewSeries"))

        const opts = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
        expect(opts.method).toBe("POST")
        expect(opts.body).toBeInstanceOf(FormData)
        expect((opts.body as FormData).get("act")).toBe("mkdir")
        expect((opts.body as FormData).get("name")).toBe("NewSeries")
      }))

    it.effect("does not set explicit content-type header (let fetch set multipart boundary)", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          text: async () => "OK",
        })

        yield* makeProgram((svc) => svc.createFolder("Test"))

        const opts = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
        expect(opts.headers).toBeUndefined()
      }))

    it.effect("fails with CopypartyFolderError when name is empty after sanitization", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(makeProgram((svc) => svc.createFolder("///")))

        expect(error.message).toContain("Folder name is empty")
      }))

    it.effect("fails with CopypartyFolderError when name is empty string", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(makeProgram((svc) => svc.createFolder("")))

        expect(error.message).toContain("Folder name is empty")
      }))
  })

  describe("deleteFolder", () => {
    it.effect("sends delete POST request", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: true,
          text: async () => "OK",
        })

        yield* makeProgram((svc) => svc.deleteFolder("OldSeries"))

        const url = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(url).toContain("delete")
        expect(url).toContain("OldSeries")

        const opts = ((globalThis as any).fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
        expect(opts.method).toBe("POST")
      }))

    it.effect("fails with CopypartyFolderError when name is empty after sanitization", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(makeProgram((svc) => svc.deleteFolder("///")))

        expect(error.message).toContain("Folder name is empty")
      }))
  })

  describe("error handling", () => {
    it.effect("fails with CopypartyNotConfigured on upload when URL is empty", () =>
      Effect.gen(function* () {
        const program = Effect.gen(function* () {
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
                }),
              ),
            ),
          ),
        )

        const error = yield* Effect.flip(program)

        expect(error.message).toContain("Copyparty URL not configured")
      }))

    it.effect("fails with CopypartyHttpError on fetch failure", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"))

        const error = yield* Effect.flip(makeProgram((svc) => svc.listFolders))

        expect(error.message).toContain("Network error")
      }))

    it.effect("fails with CopypartyHttpError on non-OK upload response", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => "Internal error",
        })

        const error = yield* Effect.flip(makeProgram((svc) => svc.uploadFile("/tmp/file.epub")))

        expect(error.message).toContain("HTTP 500")
      }))
  })
})
