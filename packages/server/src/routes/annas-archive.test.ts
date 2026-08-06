import { Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "@effect/vitest"
import type { AnnasArchiveResult } from "@inkpipe/shared"
import { annasArchiveSearchHandler, annasArchiveDownloadHandler } from "../routes/annas-archive"
import { AnnasArchiveService } from "../layers/integrations/AnnasArchive"
import { AnnasArchivePipelineService } from "../layers/pipeline/AnnasArchivePipeline"
import { CopypartyService } from "../layers/integrations/Copyparty"

const mockResults: AnnasArchiveResult[] = [
  { md5: "aaaa1111", title: "Naruto Vol. 1", author: "Masashi Kishimoto", extension: "epub", size: "6.4MB", language: "English [en]", coverUrl: "https://covers.example.com/naruto.jpg" },
]

describe("annasArchiveSearchHandler", () => {
  it.effect("returns search results as JSON", () =>
    Effect.gen(function* () {
      const layer = Layer.succeed(AnnasArchiveService, {
        search: () => Effect.succeed(mockResults),
        getDownloadUrl: () => Effect.succeed("https://cdn.example.com/book.epub"),
        downloadFile: () => Effect.void,
      } as any)

      const response = yield* annasArchiveSearchHandler("naruto").pipe(Effect.provide(layer))

      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body).toEqual(mockResults)
    }))

  it.effect("returns 502 with error message on service failure", () =>
    Effect.gen(function* () {
      const layer = Layer.succeed(AnnasArchiveService, {
        search: () => Effect.fail({ message: "Anna's Archive search failed" } as any),
        getDownloadUrl: () => Effect.succeed(""),
        downloadFile: () => Effect.void,
      } as any)

      const response = yield* annasArchiveSearchHandler("naruto").pipe(Effect.provide(layer))

      expect(response.status).toBe(502)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.error).toBe("Anna's Archive search failed")
    }))
})

function makeDownloadLayer({
  createFolderOk = true,
}: { createFolderOk?: boolean } = {}) {
  return Layer.mergeAll(
    Layer.succeed(AnnasArchivePipelineService, {
      run: () => Effect.void,
    } as any),
    Layer.succeed(CopypartyService, {
      listFolders: Effect.succeed([]),
      uploadFile: () => Effect.void,
      createFolder: () =>
        createFolderOk ? Effect.void : Effect.fail({ message: "Folder creation failed" } as any),
      deleteFolder: () => Effect.void,
    } as any),
  )
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("annasArchiveDownloadHandler", () => {
  it.effect("returns started count", () =>
    Effect.gen(function* () {
      const response = yield* annasArchiveDownloadHandler({ items: mockResults }).pipe(
        Effect.provide(makeDownloadLayer()),
      )

      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.started).toBe(1)
    }))

  it.effect("creates folder when subfolder is provided and newFolder is true", () =>
    Effect.gen(function* () {
      const createFolderSpy = vi.fn(() => Effect.void)
      const layer = Layer.mergeAll(
        Layer.succeed(AnnasArchivePipelineService, {
          run: () => Effect.void,
        } as any),
        Layer.succeed(CopypartyService, {
          listFolders: Effect.succeed([]),
          uploadFile: () => Effect.void,
          createFolder: createFolderSpy,
          deleteFolder: () => Effect.void,
        } as any),
      )

      yield* annasArchiveDownloadHandler({ items: mockResults, subfolder: "Books/New", newFolder: true }).pipe(
        Effect.provide(layer),
      )

      expect(createFolderSpy).toHaveBeenCalledWith("Books/New")
    }))

  it.effect("does NOT create folder when newFolder is false", () =>
    Effect.gen(function* () {
      const createFolderSpy = vi.fn(() => Effect.void)
      const layer = Layer.mergeAll(
        Layer.succeed(AnnasArchivePipelineService, {
          run: () => Effect.void,
        } as any),
        Layer.succeed(CopypartyService, {
          listFolders: Effect.succeed([]),
          uploadFile: () => Effect.void,
          createFolder: createFolderSpy,
          deleteFolder: () => Effect.void,
        } as any),
      )

      yield* annasArchiveDownloadHandler({ items: mockResults, subfolder: "ExistingFolder", newFolder: false }).pipe(
        Effect.provide(layer),
      )

      expect(createFolderSpy).not.toHaveBeenCalled()
    }))

  it.effect("returns 502 on folder creation error", () =>
    Effect.gen(function* () {
      const response = yield* annasArchiveDownloadHandler({ items: mockResults, subfolder: "Bad", newFolder: true }).pipe(
        Effect.provide(makeDownloadLayer({ createFolderOk: false })),
      )

      expect(response.status).toBe(502)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.error).toBe("Folder creation failed")
    }))
})
