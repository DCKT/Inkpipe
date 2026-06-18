import { Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { ProwlarrResult } from "@inkpipe/shared"
import { downloadHandler } from "../routes/download"
import { PipelineService } from "../layers/Pipeline"
import { CopypartyService } from "../layers/Copyparty"

const mockItems: ProwlarrResult[] = [
  {
    title: "Naruto T01", guid: "g1", magnetUrl: "magnet:?xt=urn:btih:abc",
    downloadUrl: null, size: 100000, seeders: 10, indexer: "Nyaa",
    categories: ["Comics"], publishDate: null,
  },
  {
    title: "One Piece v1", guid: "g2", magnetUrl: "magnet:?xt=urn:btih:def",
    downloadUrl: null, size: 200000, seeders: 5, indexer: "Nyaa",
    categories: ["Manga"], publishDate: null,
  },
]

function makeLayer({
  createFolderOk = true,
}: { createFolderOk?: boolean } = {}) {
  return Layer.mergeAll(
    Layer.succeed(PipelineService, {
      runPipeline: () => Effect.void,
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

describe("downloadHandler", () => {
  it("returns started count", async () => {
    const response = await Effect.runPromise(
      downloadHandler({ items: mockItems }).pipe(Effect.provide(makeLayer())),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.started).toBe(2)
  })

  it("creates folder when subfolder is provided and newFolder is true", async () => {
    const createFolderSpy = vi.fn(() => Effect.void)
    const layer = Layer.mergeAll(
      Layer.succeed(PipelineService, {
        runPipeline: () => Effect.void,
      } as any),
      Layer.succeed(CopypartyService, {
        listFolders: Effect.succeed([]),
        uploadFile: () => Effect.void,
        createFolder: createFolderSpy,
        deleteFolder: () => Effect.void,
      } as any),
    )

    await Effect.runPromise(
      downloadHandler({ items: mockItems, subfolder: "Manga/New", newFolder: true }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(createFolderSpy).toHaveBeenCalledWith("Manga/New")
  })

  it("does NOT create folder when subfolder is provided but newFolder is false", async () => {
    const createFolderSpy = vi.fn(() => Effect.void)
    const layer = Layer.mergeAll(
      Layer.succeed(PipelineService, {
        runPipeline: () => Effect.void,
      } as any),
      Layer.succeed(CopypartyService, {
        listFolders: Effect.succeed([]),
        uploadFile: () => Effect.void,
        createFolder: createFolderSpy,
        deleteFolder: () => Effect.void,
      } as any),
    )

    await Effect.runPromise(
      downloadHandler({ items: mockItems, subfolder: "ExistingFolder", newFolder: false }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(createFolderSpy).not.toHaveBeenCalled()
  })

  it("does NOT create folder when subfolder is provided and newFolder is undefined", async () => {
    const createFolderSpy = vi.fn(() => Effect.void)
    const layer = Layer.mergeAll(
      Layer.succeed(PipelineService, {
        runPipeline: () => Effect.void,
      } as any),
      Layer.succeed(CopypartyService, {
        listFolders: Effect.succeed([]),
        uploadFile: () => Effect.void,
        createFolder: createFolderSpy,
        deleteFolder: () => Effect.void,
      } as any),
    )

    await Effect.runPromise(
      downloadHandler({ items: mockItems, subfolder: "Something" }).pipe(
        Effect.provide(layer),
      ),
    )

    expect(createFolderSpy).not.toHaveBeenCalled()
  })

  it("returns 502 on folder creation error", async () => {
    const response = await Effect.runPromise(
      downloadHandler({ items: mockItems, subfolder: "Bad", newFolder: true }).pipe(
        Effect.provide(makeLayer({ createFolderOk: false })),
      ),
    )

    expect(response.status).toBe(502)
    const body = await response.json() as any
    expect(body.error).toBe("Folder creation failed")
  })
})
