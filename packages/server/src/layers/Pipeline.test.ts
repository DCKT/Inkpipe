import { Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ProwlarrResult, AppConfig, Job } from "@inkpipe/shared"
import { PipelineService, PipelineServiceLive } from "./Pipeline"
import { ConfigService } from "./Config"
import { JobStoreService } from "./JobStore"
import { AllDebridService } from "./AllDebrid"
import { KccService } from "./Kcc"
import { CopypartyService } from "./Copyparty"
import { FileManagerService } from "./FileManager"
import { LogService } from "./Log"

// --- Helper: guarantee a vi.fn() call always returns a Promise ---
function promisifyFn<T extends (...args: any[]) => any>(fn: T): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  return (...args: Parameters<T>) => {
    const result = fn(...args)
    return result instanceof Promise ? result : Promise.resolve(result)
  }
}

// --- Mock functions ---
const uploadMagnetFn = vi.fn<any>()
const getMagnetStatusFn = vi.fn<any>()
const getMagnetFilesFn = vi.fn<any>()
const unlockLinkFn = vi.fn<any>()
const downloadFileFn = vi.fn<any>()
const deleteMagnetFn = vi.fn<any>()
const convertFn = vi.fn<any>()
const uploadFileFn = vi.fn<any>()
const createFolderFn = vi.fn<any>()
const deleteFolderFn = vi.fn<any>()
const loadConfigFn = vi.fn<any>()
const saveConfigFn = vi.fn<any>()
const ensureJobDirFn = vi.fn<any>()
const cleanupJobDirFn = vi.fn<any>()
const findFileByExtensionFn = vi.fn<any>()
const findAllFilesByExtensionFn = vi.fn<any>()
const extractRarArchiveFn = vi.fn<any>()

// --- In-memory job store ---
const jobs: Job[] = []
let nextId = 1

function latestJob(): Job {
  return [...jobs].sort((a, b) => Number(b.id) - Number(a.id))[0]
}

function resetJobs(): void {
  jobs.length = 0
  nextId = 1
}

function buildMockAllLayers() {
  const configLayer = Layer.succeed(ConfigService, {
    loadConfig: Effect.promise(() => promisifyFn(loadConfigFn)()),
    saveConfig: (config: AppConfig) => Effect.promise(() => promisifyFn(saveConfigFn)(config)),
  })

  const jobStoreLayer = Layer.succeed(JobStoreService, {
    createJob: (title: string) =>
      Effect.sync(() => {
        const job: Job = {
          id: String(nextId++),
          title,
          stage: "UPLOADING",
          progress: 0,
          startedAt: Date.now(),
        }
        jobs.push(job)
        return job
      }),
    updateJob: (id: string, update: any) =>
      Effect.sync(() => {
        const job = jobs.find((j) => j.id === id)
        if (job) {
          if (update.stage !== undefined) (job as any).stage = update.stage
          if (update.progress !== undefined) (job as any).progress = update.progress
          if (update.error !== undefined) (job as any).error = update.error
        }
      }),
    getJob: (_id: string) => Effect.void as any,
    getAllJobs: Effect.succeed([]),
    deleteCompletedJobs: Effect.succeed(0),
  })

  const alldebridLayer = Layer.succeed(AllDebridService, {
    uploadMagnet: (magnetOrUrl: string) =>
      Effect.promise(() => promisifyFn(uploadMagnetFn)(magnetOrUrl)),
    getMagnetStatus: (magnetId: number) =>
      Effect.promise(() => promisifyFn(getMagnetStatusFn)(magnetId)),
    getMagnetFiles: (magnetId: number) =>
      Effect.promise(() => promisifyFn(getMagnetFilesFn)(magnetId)),
    unlockLink: (link: string) =>
      Effect.promise(() => promisifyFn(unlockLinkFn)(link)),
    deleteMagnet: (magnetId: number) =>
      Effect.promise(() => promisifyFn(deleteMagnetFn)(magnetId)),
    downloadFile: (
      url: string,
      destPath: string,
      onProgress?: (received: number, total: number) => void,
    ) => Effect.promise(() => promisifyFn(downloadFileFn)(url, destPath, onProgress)),
  })

  const kccLayer = Layer.succeed(KccService, {
    convert: (inputPath: string, outputDir: string) =>
      Effect.promise(() => promisifyFn(convertFn)(inputPath, outputDir)),
  })

  const copypartyLayer = Layer.succeed(CopypartyService, {
    listFolders: Effect.succeed([]),
    uploadFile: (filePath: string, subfolder?: string) =>
      Effect.promise(() => promisifyFn(uploadFileFn)(filePath, subfolder)),
    createFolder: (folderName: string) =>
      Effect.promise(() => promisifyFn(createFolderFn)(folderName)),
    deleteFolder: (folderName: string) =>
      Effect.promise(() => promisifyFn(deleteFolderFn)(folderName)),
  })

  const fileManagerLayer = Layer.succeed(FileManagerService, {
    getTempBase: Effect.succeed("/tmp/inkpipe"),
    isRunningInDocker: Effect.succeed(false),
    ensureJobDir: (jobId: string) =>
      Effect.promise(() => promisifyFn(ensureJobDirFn)(jobId)),
    cleanupJobDir: (jobId: string) =>
      Effect.promise(() => promisifyFn(cleanupJobDirFn)(jobId)),
    findFileByExtension: (dir: string, extensions: string[]) =>
      Effect.promise(() => promisifyFn(findFileByExtensionFn)(dir, extensions)),
    findAllFilesByExtension: (dir: string, extensions: string[]) =>
      Effect.promise(() => promisifyFn(findAllFilesByExtensionFn)(dir, extensions)),
    extractRarArchive: (filePath: string) =>
      Effect.promise(() => promisifyFn(extractRarArchiveFn)(filePath)),
  })

  const logLayer = Layer.succeed(LogService, {
    info: (_namespace: string, ..._message: unknown[]) => Effect.void,
    warn: (_namespace: string, ..._message: unknown[]) => Effect.void,
    error: (_namespace: string, ..._message: unknown[]) => Effect.void,
    withJob: (_jobId: string) => ({
      info: (_namespace: string, ..._message: unknown[]) => Effect.void,
      warn: (_namespace: string, ..._message: unknown[]) => Effect.void,
      error: (_namespace: string, ..._message: unknown[]) => Effect.void,
    }),
  })

  return Layer.mergeAll(
    configLayer,
    jobStoreLayer,
    alldebridLayer,
    kccLayer,
    copypartyLayer,
    fileManagerLayer,
    logLayer,
  )
}

function makePipelineProgram(result: ProwlarrResult, subfolder?: string, createdFolder?: boolean) {
  return Effect.gen(function* () {
    const svc = yield* PipelineService
    yield* svc.runPipeline(result, subfolder, createdFolder)
  }).pipe(Effect.provide(Layer.provide(PipelineServiceLive, buildMockAllLayers())))
}

// --- Test data ---
const mockConfig: AppConfig = {
  prowlarr: { url: "http://localhost:9696", apiKey: "test-key" },
  alldebrid: { apiKey: "test-debrid-key" },
  kcc: {
    dockerImage: "ghcr.io/ciromattia/kcc:latest",
    profile: "KoBO",
    format: "Auto",
    mangaStyle: false,
    webtoon: false,
    twoPanel: false,
    upscale: true,
    stretch: false,
    hq: false,
    gamma: 1.0,
    cropping: "1",
    croppingPower: 1.0,
    forceColor: true,
    forcePng: false,
    noAutoContrast: false,
    blackBorders: false,
    whiteBorders: false,
    splitter: "0",
    noProcessing: false,
    eraseRainbow: true,
    coverFill: false,
    batchSplit: "0",
    targetSize: 0,
    customWidth: 0,
    customHeight: 0,
    noKepub: false,
  },
  copyparty: { url: "", uploadPath: "/", password: "" },
  komga: { url: "", apiKey: "", defaultLibraryId: "" },
}

const baseProwlarrResult: ProwlarrResult = {
  title: "Naruto T01",
  guid: "test-guid-123",
  magnetUrl: "magnet:?xt=urn:btih:abc123",
  downloadUrl: null,
  size: 100000000,
  seeders: 10,
  indexer: "test-indexer",
  categories: ["Comics"],
  publishDate: null,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  resetJobs()

  // Defaults for all mock functions — safe no-op or success values
  loadConfigFn.mockResolvedValue(mockConfig)
  saveConfigFn.mockResolvedValue(undefined)
  uploadMagnetFn.mockResolvedValue({ id: 0, ready: true })
  getMagnetStatusFn.mockResolvedValue({ ready: true, statusCode: 4, status: "Ready" })
  getMagnetFilesFn.mockResolvedValue([])
  unlockLinkFn.mockResolvedValue({ url: "", filename: "", size: 0 })
  downloadFileFn.mockResolvedValue(undefined)
  deleteMagnetFn.mockResolvedValue(undefined)
  convertFn.mockResolvedValue("OK")
  uploadFileFn.mockResolvedValue(undefined)
  createFolderFn.mockResolvedValue(undefined)
  deleteFolderFn.mockResolvedValue(undefined)
  ensureJobDirFn.mockResolvedValue("/tmp/inkpipe-test/1")
  cleanupJobDirFn.mockResolvedValue(undefined)
  findFileByExtensionFn.mockResolvedValue(null)
  findAllFilesByExtensionFn.mockResolvedValue([])
  extractRarArchiveFn.mockResolvedValue("/tmp/inkpipe-test/1/extracted")
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PipelineService", () => {
  describe("full success: magnet already ready, cbz needs conversion", () => {
    it("goes UPLOADING -> DOWNLOADING -> CONVERTING -> DONE", async () => {
      uploadMagnetFn.mockResolvedValue({ id: 123, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "Naruto.T01.cbz", link: "https://alldebrid.com/f/abc", size: 100000000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/Naruto.T01.cbz",
        filename: "Naruto.T01.cbz",
        size: 100000000,
      })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce(null) // no epub
      findAllFilesByExtensionFn
        .mockResolvedValueOnce(["/tmp/inkpipe-test/1/Naruto.T01.cbz"]) // comic files for conversion
      convertFn.mockResolvedValue("OK")

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      const job = latestJob()
      expect(job.stage).toBe("DONE")
      expect(job.progress).toBe(100)
      expect((job as any).error).toBeUndefined()

      expect(uploadMagnetFn).toHaveBeenCalledWith("magnet:?xt=urn:btih:abc123")
      expect(getMagnetStatusFn).not.toHaveBeenCalled()
      expect(getMagnetFilesFn).toHaveBeenCalledWith(123)
      expect(unlockLinkFn).toHaveBeenCalledWith("https://alldebrid.com/f/abc")
      expect(downloadFileFn).toHaveBeenCalled()
      expect(convertFn).toHaveBeenCalledWith(
        "/tmp/inkpipe-test/1/Naruto.T01.cbz",
        "/tmp/inkpipe-test/1",
      )
      expect(cleanupJobDirFn).toHaveBeenCalled()
      expect(deleteMagnetFn).toHaveBeenCalledWith(123)
    })
  })

  describe("debrid polling", () => {
    it("polls getMagnetStatus until ready then proceeds", async () => {
      uploadMagnetFn.mockResolvedValue({ id: 456, ready: false })
      getMagnetStatusFn.mockReset()
      getMagnetStatusFn
        .mockResolvedValueOnce({ ready: false, statusCode: 1, status: "Downloading" })
        .mockResolvedValueOnce({ ready: false, statusCode: 2, status: "Downloading" })
        .mockResolvedValueOnce({ ready: true, statusCode: 4, status: "Ready" })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "file.cbz", link: "https://alldebrid.com/f/xyz", size: 5000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/file.cbz",
        filename: "file.cbz",
        size: 5000,
      })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce(null) // no epub
      findAllFilesByExtensionFn
        .mockResolvedValueOnce(["/tmp/inkpipe-test/1/file.cbz"]) // comic files for conversion
      convertFn.mockResolvedValue("OK")

      const promise = Effect.runPromise(makePipelineProgram(baseProwlarrResult))
      // The loop: poll(1) → sleep(3s) → poll(2) → sleep(3s) → poll(3) ready
      // advanceTimersByTimeAsync fires pending timers + microtasks
      await vi.advanceTimersByTimeAsync(3000) // completes sleep after poll 1
      await vi.advanceTimersByTimeAsync(3000) // completes sleep after poll 2, poll 3 runs → ready
      await vi.advanceTimersByTimeAsync(100)  // flush any remaining microtasks
      await promise

      expect(getMagnetStatusFn).toHaveBeenCalledTimes(3)
      const job = latestJob()
      expect(job.stage).toBe("DONE")
    })

    it("fails fast on debrid error status code >= 5", async () => {
      uploadMagnetFn.mockResolvedValue({ id: 789, ready: false })
      getMagnetStatusFn.mockReset()
      getMagnetStatusFn.mockResolvedValue({
        ready: false,
        statusCode: 7,
        status: "Virus detected",
      })

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      const job = latestJob()
      expect(job.stage).toBe("FAILED")
      expect((job as any).error).toBeDefined()
      expect((job as any).error).toContain("Virus detected")
      expect(cleanupJobDirFn).toHaveBeenCalled()
    })
  })

  describe("torrent URL fallback", () => {
    it("uses downloadUrl when magnetUrl is null", async () => {
      const result: ProwlarrResult = {
        ...baseProwlarrResult,
        magnetUrl: null,
        downloadUrl: "http://prowlarr/download/torrent.torrent",
      }

      uploadMagnetFn.mockResolvedValue({ id: 100, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "file.epub", link: "https://alldebrid.com/f/aaa", size: 3000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/file.epub",
        filename: "file.epub",
        size: 3000,
      })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce("/tmp/inkpipe-test/1/file.epub")

      await Effect.runPromise(makePipelineProgram(result))

      expect(uploadMagnetFn).toHaveBeenCalledWith("http://prowlarr/download/torrent.torrent")
      const job = latestJob()
      expect(job.stage).toBe("DONE")
    })
  })

  describe("no URL available", () => {
    it("throws when both magnetUrl and downloadUrl are null", async () => {
      const result: ProwlarrResult = {
        ...baseProwlarrResult,
        magnetUrl: null,
        downloadUrl: null,
      }

      await expect(Effect.runPromise(makePipelineProgram(result))).rejects.toThrow(
        "No magnet or download URL",
      )
    })
  })

  describe("epub skip conversion", () => {
    it("skips KCC when downloaded file is already an epub", async () => {
      uploadMagnetFn.mockResolvedValue({ id: 200, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "book.epub", link: "https://alldebrid.com/f/bbb", size: 5000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/book.epub",
        filename: "book.epub",
        size: 5000,
      })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce("/tmp/inkpipe-test/1/book.epub")

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      expect(convertFn).not.toHaveBeenCalled()
      const job = latestJob()
      expect(job.stage).toBe("DONE")
    })
  })

  describe("multiple files", () => {
    it("downloads and unlocks all files from debrid", async () => {
      uploadMagnetFn.mockResolvedValue({ id: 300, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "part1.cbz", link: "https://alldebrid.com/f/p1", size: 1000 },
        { filename: "part2.cbz", link: "https://alldebrid.com/f/p2", size: 2000 },
      ])
      unlockLinkFn
        .mockResolvedValueOnce({ url: "https://cdn.example.com/part1.cbz", filename: "part1.cbz", size: 1000 })
        .mockResolvedValueOnce({ url: "https://cdn.example.com/part2.cbz", filename: "part2.cbz", size: 2000 })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce(null) // no epub
      findAllFilesByExtensionFn
        .mockResolvedValueOnce(["/tmp/inkpipe-test/1/part1.cbz", "/tmp/inkpipe-test/1/part2.cbz"]) // comic files for conversion
      convertFn.mockResolvedValue("OK")

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      expect(unlockLinkFn).toHaveBeenCalledTimes(2)
      expect(downloadFileFn).toHaveBeenCalledTimes(2)
    })

    it("converts all comic files with KCC", async () => {
      uploadMagnetFn.mockResolvedValue({ id: 301, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "vol1.cbz", link: "https://alldebrid.com/f/v1", size: 1000 },
        { filename: "vol2.cbz", link: "https://alldebrid.com/f/v2", size: 2000 },
      ])
      unlockLinkFn
        .mockResolvedValueOnce({ url: "https://cdn.example.com/vol1.cbz", filename: "vol1.cbz", size: 1000 })
        .mockResolvedValueOnce({ url: "https://cdn.example.com/vol2.cbz", filename: "vol2.cbz", size: 2000 })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce(null) // no epub
      findAllFilesByExtensionFn
        .mockResolvedValueOnce(["/tmp/inkpipe-test/1/vol1.cbz", "/tmp/inkpipe-test/1/vol2.cbz"]) // comic files for conversion
      convertFn.mockResolvedValue("OK")

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      expect(convertFn).toHaveBeenCalledTimes(2)
      expect(convertFn).toHaveBeenCalledWith("/tmp/inkpipe-test/1/vol1.cbz", "/tmp/inkpipe-test/1")
      expect(convertFn).toHaveBeenCalledWith("/tmp/inkpipe-test/1/vol2.cbz", "/tmp/inkpipe-test/1")
      const job = latestJob()
      expect(job.stage).toBe("DONE")
    })

    it("extracts cbr/rar files before passing to KCC", async () => {
      uploadMagnetFn.mockResolvedValue({ id: 302, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "comic.cbr", link: "https://alldebrid.com/f/r1", size: 3000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/comic.cbr",
        filename: "comic.cbr",
        size: 3000,
      })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce(null) // no epub
      findAllFilesByExtensionFn
        .mockResolvedValueOnce(["/tmp/inkpipe-test/1/comic.cbr"]) // comic files for conversion
      extractRarArchiveFn.mockResolvedValue("/tmp/inkpipe-test/1/comic")
      convertFn.mockResolvedValue("OK")

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      expect(extractRarArchiveFn).toHaveBeenCalledWith("/tmp/inkpipe-test/1/comic.cbr")
      expect(convertFn).toHaveBeenCalledWith("/tmp/inkpipe-test/1/comic", "/tmp/inkpipe-test/1")
      const job = latestJob()
      expect(job.stage).toBe("DONE")
    })
  })

  describe("copyparty upload", () => {
    it("uploads to Copyparty when configured (+subfolder)", async () => {
      const configWithCopyparty: AppConfig = {
        ...mockConfig,
        copyparty: { url: "http://localhost:3923", uploadPath: "/comics", password: "secret" },
      }
      loadConfigFn.mockResolvedValue(configWithCopyparty)

      uploadMagnetFn.mockResolvedValue({ id: 400, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "comic.cbz", link: "https://alldebrid.com/f/ccc", size: 8000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/comic.cbz",
        filename: "comic.cbz",
        size: 8000,
      })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce(null) // no epub before convert
      findAllFilesByExtensionFn
        .mockResolvedValueOnce(["/tmp/inkpipe-test/1/comic.cbz"]) // comic files for conversion
        .mockResolvedValueOnce(["/tmp/inkpipe-test/1/comic.epub"]) // epubs for copyparty upload
      convertFn.mockResolvedValue("OK")
      uploadFileFn.mockResolvedValue(undefined)

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      expect(uploadFileFn).toHaveBeenCalledWith(
        "/tmp/inkpipe-test/1/comic.epub",
        undefined,
      )
      const job = latestJob()
      expect(job.stage).toBe("DONE")
    })

    it("skips Copyparty upload when not configured", async () => {
      uploadMagnetFn.mockResolvedValue({ id: 500, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "file.epub", link: "https://alldebrid.com/f/ddd", size: 4000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/file.epub",
        filename: "file.epub",
        size: 4000,
      })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce("/tmp/inkpipe-test/1/file.epub")

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      expect(uploadFileFn).not.toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    it("marks job as FAILED when uploadMagnet throws", async () => {
      uploadMagnetFn.mockRejectedValue(new Error("AllDebrid API down"))

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      const job = latestJob()
      expect(job.stage).toBe("FAILED")
      expect((job as any).error).toContain("AllDebrid API down")
      expect(cleanupJobDirFn).toHaveBeenCalled()
      expect(deleteMagnetFn).not.toHaveBeenCalled()
    })

    it("marks job as FAILED when getMagnetFiles returns empty", async () => {
      uploadMagnetFn.mockResolvedValue({ id: 600, ready: true })
      getMagnetFilesFn.mockResolvedValue([])

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      const job = latestJob()
      expect(job.stage).toBe("FAILED")
      expect((job as any).error).toContain("No files returned")
    })

    it("marks job as FAILED when download fails and still cleans up", async () => {
      uploadMagnetFn.mockResolvedValue({ id: 700, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "file.cbz", link: "https://alldebrid.com/f/eee", size: 5000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/file.cbz",
        filename: "file.cbz",
        size: 5000,
      })
      downloadFileFn.mockRejectedValue(new Error("Network timeout"))

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      const job = latestJob()
      expect(job.stage).toBe("FAILED")
      expect((job as any).error).toContain("Network timeout")
      expect(cleanupJobDirFn).toHaveBeenCalled()
      expect(deleteMagnetFn).toHaveBeenCalledWith(700)
    })

    it("marks job as FAILED when KCC conversion fails", async () => {
      uploadMagnetFn.mockResolvedValue({ id: 800, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "file.cbz", link: "https://alldebrid.com/f/fff", size: 5000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/file.cbz",
        filename: "file.cbz",
        size: 5000,
      })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce(null) // no epub
      findAllFilesByExtensionFn
        .mockResolvedValueOnce(["/tmp/inkpipe-test/1/file.cbz"]) // comic files for conversion
      convertFn.mockRejectedValue(new Error("KCC Docker exited with code 1: segfault"))

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      const job = latestJob()
      expect(job.stage).toBe("FAILED")
      expect((job as any).error).toContain("KCC Docker exited")
    })

    it("marks job as FAILED when Copyparty upload fails", async () => {
      const configWithCopyparty: AppConfig = {
        ...mockConfig,
        copyparty: { url: "http://localhost:3923", uploadPath: "/", password: "" },
      }
      loadConfigFn.mockResolvedValue(configWithCopyparty)

      uploadMagnetFn.mockResolvedValue({ id: 900, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "file.epub", link: "https://alldebrid.com/f/ggg", size: 4000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/file.epub",
        filename: "file.epub",
        size: 4000,
      })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce("/tmp/inkpipe-test/1/file.epub") // epub found, skip convert
      findAllFilesByExtensionFn
        .mockResolvedValueOnce(["/tmp/inkpipe-test/1/file.epub"]) // copyparty epub search
      uploadFileFn.mockRejectedValue(new Error("Connection refused"))

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult))

      const job = latestJob()
      expect(job.stage).toBe("FAILED")
      expect((job as any).error).toContain("Connection refused")
    })
  })

  describe("folder creation and cleanup", () => {
    it("deletes folder on pipeline failure when createdFolder is true", async () => {
      const configWithCopyparty: AppConfig = {
        ...mockConfig,
        copyparty: { url: "http://localhost:3923", uploadPath: "/", password: "" },
      }
      loadConfigFn.mockResolvedValue(configWithCopyparty)

      uploadMagnetFn.mockRejectedValue(new Error("AllDebrid API down"))

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult, "manga/test", true))

      expect(deleteFolderFn).toHaveBeenCalledWith("manga/test")
      const job = latestJob()
      expect(job.stage).toBe("FAILED")
    })

    it("does NOT delete folder on pipeline failure when createdFolder is false", async () => {
      const configWithCopyparty: AppConfig = {
        ...mockConfig,
        copyparty: { url: "http://localhost:3923", uploadPath: "/", password: "" },
      }
      loadConfigFn.mockResolvedValue(configWithCopyparty)

      uploadMagnetFn.mockRejectedValue(new Error("AllDebrid API down"))

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult, "existing/folder", false))

      expect(deleteFolderFn).not.toHaveBeenCalled()
      const job = latestJob()
      expect(job.stage).toBe("FAILED")
    })

    it("does NOT delete folder on pipeline success", async () => {
      const configWithCopyparty: AppConfig = {
        ...mockConfig,
        copyparty: { url: "http://localhost:3923", uploadPath: "/", password: "" },
      }
      loadConfigFn.mockResolvedValue(configWithCopyparty)

      uploadMagnetFn.mockResolvedValue({ id: 100, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "file.epub", link: "https://alldebrid.com/f/xxx", size: 4000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/file.epub",
        filename: "file.epub",
        size: 4000,
      })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce("/tmp/inkpipe-test/1/file.epub")
      findAllFilesByExtensionFn
        .mockResolvedValueOnce(["/tmp/inkpipe-test/1/file.epub"])
      uploadFileFn.mockResolvedValue(undefined)

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult, "manga/test", true))

      expect(deleteFolderFn).not.toHaveBeenCalled()
      const job = latestJob()
      expect(job.stage).toBe("DONE")
    })

    it("deletes folder when Copyparty upload fails", async () => {
      const configWithCopyparty: AppConfig = {
        ...mockConfig,
        copyparty: { url: "http://localhost:3923", uploadPath: "/", password: "" },
      }
      loadConfigFn.mockResolvedValue(configWithCopyparty)

      uploadMagnetFn.mockResolvedValue({ id: 200, ready: true })
      getMagnetFilesFn.mockResolvedValue([
        { filename: "file.epub", link: "https://alldebrid.com/f/yyy", size: 4000 },
      ])
      unlockLinkFn.mockResolvedValue({
        url: "https://cdn.example.com/file.epub",
        filename: "file.epub",
        size: 4000,
      })
      downloadFileFn.mockResolvedValue(undefined)
      findFileByExtensionFn.mockResolvedValueOnce("/tmp/inkpipe-test/1/file.epub")
      findAllFilesByExtensionFn
        .mockResolvedValueOnce(["/tmp/inkpipe-test/1/file.epub"])
      uploadFileFn.mockRejectedValue(new Error("Connection refused"))

      await Effect.runPromise(makePipelineProgram(baseProwlarrResult, "manga/test", true))

      expect(deleteFolderFn).toHaveBeenCalledWith("manga/test")
      const job = latestJob()
      expect(job.stage).toBe("FAILED")
    })
  })
})
