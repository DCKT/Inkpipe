import { Context, Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "@effect/vitest"
import type { AnnasArchiveResult, AppConfig, Job } from "@inkpipe/shared"
import { JobId } from "@inkpipe/shared"
import { AnnasArchivePipelineService, AnnasArchivePipelineServiceLive } from "./AnnasArchivePipeline"
import { AnnasArchiveService } from "../integrations/AnnasArchive"
import { CopypartyService } from "../integrations/Copyparty"
import { FileManagerService } from "./FileManager"
import { ConfigService } from "../core/Config"
import { JobStoreService } from "../storage/JobStore"
import { LogServiceLive } from "../core/Log"

const testResult: AnnasArchiveResult = {
  md5: "aaaa1111",
  title: "Naruto Vol. 1",
  author: "Masashi Kishimoto",
  extension: "epub",
  size: "6.4MB",
  language: "English [en]",
  coverUrl: "https://covers.example.com/naruto.jpg",
}

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
  copyparty: { url: "http://cp:3923", uploadPath: "/", password: "" },
  komga: { url: "", apiKey: "", defaultLibraryId: "" },
  annasArchive: { apiKey: "test-key", baseUrl: "https://annas-archive.gl" },
  telegram: { botToken: "", chatId: "" },
  general: { publicUrl: "" },
}

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
  getDownloadUrl?: (md5: string) => Effect.Effect<string, any>
  downloadFile?: (url: string, destPath: string, onProgress?: (r: number, t: number) => void) => Effect.Effect<void, any>
  uploadFile?: (filePath: string, subfolder?: string) => Effect.Effect<void, any>
  deleteFolder?: (name: string) => Effect.Effect<void, any>
  copypartyUrl?: string
  updateJobSpy?: ReturnType<typeof vi.fn>
}

function makeLayer(deps: Deps = {}) {
  const updateJobSpy = deps.updateJobSpy ?? vi.fn((_id: number, _update: any) => Effect.void)

  return Layer.mergeAll(
    LogServiceLive,
    Layer.succeed(AnnasArchiveService, {
      search: () => Effect.succeed([]),
      getDownloadUrl: deps.getDownloadUrl ?? (() => Effect.succeed("https://cdn.example.com/book.epub")),
      downloadFile: deps.downloadFile ?? (() => Effect.void),
    } as any),
    Layer.succeed(CopypartyService, {
      listFolders: Effect.succeed([]),
      uploadFile: deps.uploadFile ?? (() => Effect.void),
      createFolder: () => Effect.void,
      deleteFolder: deps.deleteFolder ?? (() => Effect.void),
    } as any),
    Layer.succeed(FileManagerService, {
      getTempBase: Effect.succeed("/tmp/inkpipe"),
      isRunningInDocker: Effect.succeed(false),
      ensureJobDir: () => Effect.succeed("/tmp/inkpipe/1"),
      cleanupJobDir: () => Effect.void,
      findFileByExtension: () => Effect.succeed(null),
      findAllFilesByExtension: () => Effect.succeed([]),
      extractRarArchive: () => Effect.succeed(""),
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
  prog: (svc: Context.Service.Shape<typeof AnnasArchivePipelineService>) => Effect.Effect<T, E>,
  deps: Deps = {},
) {
  return Effect.gen(function* () {
    const svc = yield* AnnasArchivePipelineService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(AnnasArchivePipelineServiceLive, makeLayer(deps))))
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("AnnasArchivePipelineService", () => {
  it.effect("runs DOWNLOADING -> UPLOADING_COPYPARTY -> DONE on success", () =>
    Effect.gen(function* () {
      const updateJobSpy = vi.fn((_id: number, _update: any) => Effect.void)
      yield* makeProgram((svc) => svc.run(testResult), { updateJobSpy })

      const stages = updateJobSpy.mock.calls
        .map((call) => (call[1] as { stage?: string }).stage)
        .filter((s): s is string => Boolean(s))

      expect(stages).toEqual(["DOWNLOADING", "UPLOADING_COPYPARTY", "DONE"])
    }))

  it.effect("skips Copyparty upload when not configured", () =>
    Effect.gen(function* () {
      const uploadFileSpy = vi.fn((_filePath: string, _subfolder?: string) => Effect.void)
      yield* makeProgram((svc) => svc.run(testResult), { uploadFile: uploadFileSpy, copypartyUrl: "" })

      expect(uploadFileSpy).not.toHaveBeenCalled()
    }))

  it.effect("uses result.extension for the destination filename when present", () =>
    Effect.gen(function* () {
      const uploadFileSpy = vi.fn((_filePath: string, _subfolder?: string) => Effect.void)
      yield* makeProgram((svc) => svc.run(testResult), { uploadFile: uploadFileSpy })

      const uploadedPath = uploadFileSpy.mock.calls[0]?.[0] as string
      expect(uploadedPath).toContain("Naruto Vol. 1.epub")
    }))

  it.effect("falls back to .bin when no extension can be determined", () =>
    Effect.gen(function* () {
      const uploadFileSpy = vi.fn((_filePath: string, _subfolder?: string) => Effect.void)
      const noExtResult = { ...testResult, extension: null }
      yield* makeProgram((svc) => svc.run(noExtResult), {
        uploadFile: uploadFileSpy,
        getDownloadUrl: () => Effect.succeed("https://cdn.example.com/book-no-extension"),
      })

      const uploadedPath = uploadFileSpy.mock.calls[0]?.[0] as string
      expect(uploadedPath).toContain(".bin")
    }))

  it.effect("recovers a missing extension from the download URL", () =>
    Effect.gen(function* () {
      const uploadFileSpy = vi.fn((_filePath: string, _subfolder?: string) => Effect.void)
      const noExtResult = { ...testResult, extension: null }
      yield* makeProgram((svc) => svc.run(noExtResult), {
        uploadFile: uploadFileSpy,
        getDownloadUrl: () => Effect.succeed("https://cdn.example.com/book.pdf"),
      })

      const uploadedPath = uploadFileSpy.mock.calls[0]?.[0] as string
      expect(uploadedPath).toContain(".pdf")
    }))

  it.effect("marks the job FAILED when resolving the download URL fails", () =>
    Effect.gen(function* () {
      const updateJobSpy = vi.fn((_id: number, _update: any) => Effect.void)
      const getDownloadUrlSpy = vi.fn(() => Effect.fail({ message: "all mirrors down" }))

      yield* makeProgram((svc) => svc.run(testResult), { getDownloadUrl: getDownloadUrlSpy, updateJobSpy })

      expect(getDownloadUrlSpy).toHaveBeenCalledTimes(1)
      const failedCall = updateJobSpy.mock.calls.find(
        (call) => (call[1] as { stage?: string }).stage === "FAILED",
      )
      expect(failedCall).toBeDefined()
      expect((failedCall![1] as { error?: string }).error).toContain("all mirrors down")
    }))

  it.effect("cleans up the deleted folder on failure when it created one", () =>
    Effect.gen(function* () {
      const deleteFolderSpy = vi.fn((_name: string) => Effect.void)
      yield* makeProgram(
        (svc) => svc.run(testResult, "NewFolder", true),
        {
          getDownloadUrl: () => Effect.fail({ message: "boom" }),
          deleteFolder: deleteFolderSpy,
        },
      )

      expect(deleteFolderSpy).toHaveBeenCalledWith("NewFolder")
    }))
})
