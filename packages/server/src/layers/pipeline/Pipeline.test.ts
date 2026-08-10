import { Context, Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "@effect/vitest"
import type { AppConfig, Job, ProwlarrResult, DebridFile } from "@inkpipe/shared"
import { JobId } from "@inkpipe/shared"
import { PipelineService, PipelineServiceLive } from "./Pipeline"
import { AllDebridService } from "../integrations/AllDebrid"
import { KccService } from "../integrations/Kcc"
import { CopypartyService } from "../integrations/Copyparty"
import { FileManagerService } from "./FileManager"
import { ConfigService } from "../core/Config"
import { JobStoreService } from "../storage/JobStore"
import { LogServiceLive } from "../core/Log"

const testResult: ProwlarrResult = {
  title: "One Piece v01",
  guid: "guid-1",
  magnetUrl: "magnet:?xt=urn:btih:abc",
  downloadUrl: null,
  size: 123456,
  seeders: 10,
  indexer: "Nyaa",
  categories: ["Comics"],
  publishDate: "2024-06-01T00:00:00Z",
}

const testConfig: AppConfig = {
  prowlarr: { url: "", apiKey: "" },
  alldebrid: { apiKey: "test-key" },
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
  copyparty: { url: "http://cp:3923", uploadPath: "/", password: "" },
  komga: { url: "", apiKey: "", defaultLibraryId: "" },
  annasArchive: { apiKey: "", baseUrl: "https://annas-archive.gl" },
}

const testFile: DebridFile = { filename: "one-piece-v01.cbz", link: "https://debrid/link", size: 1000 }

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: JobId.make(1),
    title: testResult.title,
    stage: "UPLOADING",
    progress: 0,
    startedAt: Date.now(),
    createdAt: "",
    updatedAt: "",
    ...overrides,
  }
}

interface Deps {
  uploadMagnet?: (magnetOrUrl: string) => Effect.Effect<{ id: number; ready: boolean }, any>
  getMagnetStatus?: (magnetId: number) => Effect.Effect<{ ready: boolean; statusCode: number; status: string }, any>
  getMagnetFiles?: (magnetId: number) => Effect.Effect<DebridFile[], any>
  unlockLink?: (link: string) => Effect.Effect<{ url: string; filename: string; size: number }, any>
  deleteMagnet?: (magnetId: number) => Effect.Effect<void, any>
  downloadFile?: (url: string, destPath: string, onProgress?: (r: number, t: number) => void) => Effect.Effect<void, any>
  kccConvert?: (inputPath: string, outputDir: string) => Effect.Effect<string, any>
  copypartyUploadFile?: (filePath: string, subfolder?: string) => Effect.Effect<void, any>
  deleteFolder?: (name: string) => Effect.Effect<void, any>
  copypartyUrl?: string
  findFileByExtension?: (dir: string, extensions: string[]) => Effect.Effect<string | null, any>
  findAllFilesByExtension?: (dir: string, extensions: string[]) => Effect.Effect<string[], any>
  extractRarArchive?: (filePath: string) => Effect.Effect<string, any>
  updateJobSpy?: ReturnType<typeof vi.fn>
  deleteMagnetSpy?: ReturnType<typeof vi.fn>
}

function makeLayer(deps: Deps = {}) {
  const updateJobSpy = deps.updateJobSpy ?? vi.fn((_id: number, _update: any) => Effect.void)
  const deleteMagnetSpy = deps.deleteMagnetSpy ?? vi.fn((_id: number) => Effect.void)

  return Layer.mergeAll(
    LogServiceLive,
    Layer.succeed(AllDebridService, {
      uploadMagnet: deps.uploadMagnet ?? (() => Effect.succeed({ id: 1, ready: true })),
      getMagnetStatus: deps.getMagnetStatus ?? (() => Effect.succeed({ ready: true, statusCode: 4, status: "Ready" })),
      getMagnetFiles: deps.getMagnetFiles ?? (() => Effect.succeed([testFile])),
      unlockLink: deps.unlockLink ?? (() => Effect.succeed({ url: "https://cdn/one-piece-v01.cbz", filename: testFile.filename, size: testFile.size })),
      deleteMagnet: deps.deleteMagnet ?? deleteMagnetSpy,
      downloadFile: deps.downloadFile ?? (() => Effect.void),
    } as any),
    Layer.succeed(KccService, {
      convert: deps.kccConvert ?? (() => Effect.succeed("")),
    } as any),
    Layer.succeed(CopypartyService, {
      listFolders: Effect.succeed([]),
      uploadFile: deps.copypartyUploadFile ?? (() => Effect.void),
      createFolder: () => Effect.void,
      deleteFolder: deps.deleteFolder ?? (() => Effect.void),
    } as any),
    Layer.succeed(FileManagerService, {
      getTempBase: Effect.succeed("/tmp/inkpipe"),
      isRunningInDocker: Effect.succeed(false),
      ensureJobDir: () => Effect.succeed("/tmp/inkpipe/1"),
      cleanupJobDir: () => Effect.void,
      findFileByExtension: deps.findFileByExtension ?? (() => Effect.succeed(null)),
      findAllFilesByExtension: deps.findAllFilesByExtension ?? (() => Effect.succeed([testFile.filename])),
      extractRarArchive: deps.extractRarArchive ?? (() => Effect.succeed("")),
    } as any),
    Layer.succeed(ConfigService, {
      loadConfig: Effect.succeed({
        ...testConfig,
        copyparty: { ...testConfig.copyparty, url: deps.copypartyUrl ?? testConfig.copyparty.url },
      }),
      saveConfig: () => Effect.void,
    } as any),
    Layer.succeed(JobStoreService, {
      createJob: (title: string) => Effect.succeed(makeJob({ title })),
      updateJob: updateJobSpy,
      getJob: () => Effect.succeed(undefined as any),
      getAllJobs: Effect.succeed([]),
      deleteCompletedJobs: Effect.succeed(0),
    } as any),
  )
}

function makeProgram<T, E>(
  prog: (svc: Context.Service.Shape<typeof PipelineService>) => Effect.Effect<T, E>,
  deps: Deps = {},
) {
  return Effect.gen(function* () {
    const svc = yield* PipelineService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(PipelineServiceLive, makeLayer(deps))))
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("PipelineService", () => {
  it.effect("fails immediately when the result has neither magnetUrl nor downloadUrl", () =>
    Effect.gen(function* () {
      const result = yield* makeProgram(
        (svc) => svc.runPipeline({ ...testResult, magnetUrl: null, downloadUrl: null }).pipe(Effect.exit),
      )
      expect(result._tag).toBe("Failure")
    }))

  it.effect("runs UPLOADING -> DOWNLOADING -> UPLOADING_COPYPARTY -> DONE when already ready and already an epub", () =>
    Effect.gen(function* () {
      const updateJobSpy = vi.fn((_id: number, _update: any) => Effect.void)
      yield* makeProgram((svc) => svc.runPipeline(testResult), {
        updateJobSpy,
        findFileByExtension: () => Effect.succeed("/tmp/inkpipe/1/one-piece-v01.epub"),
        findAllFilesByExtension: () => Effect.succeed(["/tmp/inkpipe/1/one-piece-v01.epub"]),
      })

      const stages = updateJobSpy.mock.calls
        .map((call) => (call[1] as { stage?: string }).stage)
        .filter((s): s is string => Boolean(s))

      expect(stages).toEqual(["UPLOADING", "DOWNLOADING", "UPLOADING_COPYPARTY", "DONE"])
    }))

  // Pipeline.ts polls on a real 3s `setTimeout` between attempts (POLL_INTERVAL,
  // not injectable, not on TestClock) — plain `it` + `Effect.runPromise` per the
  // established pattern in AllDebrid.test.ts, since `it.effect`'s AbortSignal
  // wiring hangs when combined with real (non-TestClock) delays in this stack.
  it("polls DEBRID_PROCESSING until AllDebrid reports Ready, without duplicate polling once ready", async () => {
    const updateJobSpy = vi.fn((_id: number, _update: any) => Effect.void)
    let calls = 0
    const getMagnetStatus = vi.fn(() => {
      calls++
      return calls < 3
        ? Effect.succeed({ ready: false, statusCode: 1, status: "Downloading" })
        : Effect.succeed({ ready: true, statusCode: 4, status: "Ready" })
    })

    await Effect.runPromise(
      makeProgram((svc) => svc.runPipeline(testResult), {
        updateJobSpy,
        uploadMagnet: () => Effect.succeed({ id: 1, ready: false }),
        getMagnetStatus,
      }),
    )

    expect(getMagnetStatus).toHaveBeenCalledTimes(3)
    const stages = updateJobSpy.mock.calls
      .map((call) => (call[1] as { stage?: string }).stage)
      .filter((s): s is string => Boolean(s))
    expect(stages).toContain("DEBRID_PROCESSING")
    expect(stages[stages.length - 1]).toBe("DONE")
  }, 12000)

  it.effect("fails the job when AllDebrid reports a terminal magnet error while polling", () =>
    Effect.gen(function* () {
      const updateJobSpy = vi.fn((_id: number, _update: any) => Effect.void)
      yield* makeProgram((svc) => svc.runPipeline(testResult), {
        updateJobSpy,
        uploadMagnet: () => Effect.succeed({ id: 1, ready: false }),
        getMagnetStatus: () => Effect.succeed({ ready: false, statusCode: 5, status: "Error" }),
      })

      const failedCall = updateJobSpy.mock.calls.find(
        (call) => (call[1] as { stage?: string }).stage === "FAILED",
      )
      expect(failedCall).toBeDefined()
      expect((failedCall![1] as { error?: string }).error).toContain("AllDebrid magnet error")
    }))

  it.effect("fails the job when AllDebrid returns no files", () =>
    Effect.gen(function* () {
      const updateJobSpy = vi.fn((_id: number, _update: any) => Effect.void)
      yield* makeProgram((svc) => svc.runPipeline(testResult), {
        updateJobSpy,
        getMagnetFiles: () => Effect.succeed([]),
      })

      const failedCall = updateJobSpy.mock.calls.find(
        (call) => (call[1] as { stage?: string }).stage === "FAILED",
      )
      expect(failedCall).toBeDefined()
      expect((failedCall![1] as { error?: string }).error).toContain("No files returned")
    }))

  it.effect("skips conversion when the downloaded file is already an epub", () =>
    Effect.gen(function* () {
      const kccConvert = vi.fn(() => Effect.succeed(""))
      yield* makeProgram((svc) => svc.runPipeline(testResult), {
        kccConvert,
        findFileByExtension: () => Effect.succeed("/tmp/inkpipe/1/already.epub"),
      })

      expect(kccConvert).not.toHaveBeenCalled()
    }))

  it.effect("converts comic files with KCC when no epub is already present", () =>
    Effect.gen(function* () {
      const kccConvert = vi.fn((_inputPath: string, _outputDir: string) => Effect.succeed(""))
      yield* makeProgram((svc) => svc.runPipeline(testResult), {
        kccConvert,
        findFileByExtension: () => Effect.succeed(null),
        findAllFilesByExtension: (_dir, extensions) =>
          extensions.includes(".cbz")
            ? Effect.succeed(["/tmp/inkpipe/1/one-piece-v01.cbz"])
            : Effect.succeed([]),
      })

      expect(kccConvert).toHaveBeenCalledTimes(1)
      expect(kccConvert.mock.calls[0]?.[0]).toContain(".cbz")
    }))

  it.effect("extracts a RAR archive before converting it", () =>
    Effect.gen(function* () {
      const extractRarArchive = vi.fn(() => Effect.succeed("/tmp/inkpipe/1/extracted.cbz"))
      const kccConvert = vi.fn(() => Effect.succeed(""))
      yield* makeProgram((svc) => svc.runPipeline(testResult), {
        kccConvert,
        extractRarArchive,
        findFileByExtension: () => Effect.succeed(null),
        findAllFilesByExtension: (_dir, extensions) =>
          extensions.includes(".cbr")
            ? Effect.succeed(["/tmp/inkpipe/1/one-piece-v01.cbr"])
            : Effect.succeed([]),
      })

      expect(extractRarArchive).toHaveBeenCalledWith("/tmp/inkpipe/1/one-piece-v01.cbr")
      expect(kccConvert).toHaveBeenCalledWith("/tmp/inkpipe/1/extracted.cbz", "/tmp/inkpipe/1")
    }))

  it.effect("skips Copyparty upload when not configured", () =>
    Effect.gen(function* () {
      const copypartyUploadFile = vi.fn(() => Effect.void)
      yield* makeProgram((svc) => svc.runPipeline(testResult), {
        copypartyUploadFile,
        copypartyUrl: "",
      })

      expect(copypartyUploadFile).not.toHaveBeenCalled()
    }))

  it.effect("uploads to Copyparty and reaches DONE when configured", () =>
    Effect.gen(function* () {
      const copypartyUploadFile = vi.fn(() => Effect.void)
      const updateJobSpy = vi.fn((_id: number, _update: any) => Effect.void)
      yield* makeProgram((svc) => svc.runPipeline(testResult), { copypartyUploadFile, updateJobSpy })

      expect(copypartyUploadFile).toHaveBeenCalledTimes(1)
      const stages = updateJobSpy.mock.calls
        .map((call) => (call[1] as { stage?: string }).stage)
        .filter((s): s is string => Boolean(s))
      expect(stages[stages.length - 1]).toBe("DONE")
    }))

  it.effect("marks the job FAILED and deletes the magnet on a mid-pipeline failure", () =>
    Effect.gen(function* () {
      const updateJobSpy = vi.fn((_id: number, _update: any) => Effect.void)
      const deleteMagnetSpy = vi.fn((_id: number) => Effect.void)
      yield* makeProgram((svc) => svc.runPipeline(testResult), {
        updateJobSpy,
        deleteMagnetSpy,
        deleteMagnet: deleteMagnetSpy,
        unlockLink: () => Effect.fail(new Error("unlock failed")),
      })

      const failedCall = updateJobSpy.mock.calls.find(
        (call) => (call[1] as { stage?: string }).stage === "FAILED",
      )
      expect(failedCall).toBeDefined()
      expect((failedCall![1] as { error?: string }).error).toContain("unlock failed")
      expect(deleteMagnetSpy).toHaveBeenCalledWith(1)
    }))

  it.effect("cleans up the created Copyparty folder on failure", () =>
    Effect.gen(function* () {
      const deleteFolderSpy = vi.fn((_name: string) => Effect.void)
      yield* makeProgram(
        (svc) => svc.runPipeline(testResult, "NewFolder", true),
        {
          deleteFolder: deleteFolderSpy,
          unlockLink: () => Effect.fail(new Error("boom")),
        },
      )

      expect(deleteFolderSpy).toHaveBeenCalledWith("NewFolder")
    }))

  it.effect("does not attempt folder cleanup on failure when it did not create one", () =>
    Effect.gen(function* () {
      const deleteFolderSpy = vi.fn((_name: string) => Effect.void)
      yield* makeProgram(
        (svc) => svc.runPipeline(testResult, "ExistingFolder", false),
        {
          deleteFolder: deleteFolderSpy,
          unlockLink: () => Effect.fail(new Error("boom")),
        },
      )

      expect(deleteFolderSpy).not.toHaveBeenCalled()
    }))
})
