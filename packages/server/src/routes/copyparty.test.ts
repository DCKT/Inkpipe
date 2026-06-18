import { Effect, Layer } from "effect"
import { describe, it, expect } from "vitest"
import {
  copypartyFoldersHandler,
  createFolderHandler,
  deleteFolderHandler,
} from "../routes/copyparty"
import { CopypartyService } from "../layers/Copyparty"

function makeLayer(opts: {
  folders?: string[]
  createOk?: boolean
  deleteOk?: boolean
} = {}) {
  return Layer.succeed(CopypartyService, {
    listFolders: Effect.succeed(opts.folders ?? ["Manga", "Comics"]),
    uploadFile: () => Effect.void,
    createFolder: () =>
      opts.createOk !== false ? Effect.void : Effect.fail({ message: "Create failed" } as any),
    deleteFolder: () =>
      opts.deleteOk !== false ? Effect.void : Effect.fail({ message: "Delete failed" } as any),
  } as any)
}

describe("copypartyFoldersHandler", () => {
  it("returns folders as JSON", async () => {
    const response = await Effect.runPromise(
      copypartyFoldersHandler.pipe(Effect.provide(makeLayer())),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.folders).toEqual(["Manga", "Comics"])
  })

  it("returns 502 on error", async () => {
    const layer = Layer.succeed(CopypartyService, {
      listFolders: Effect.fail({ message: "Error" } as any),
      uploadFile: () => Effect.void,
      createFolder: () => Effect.void,
      deleteFolder: () => Effect.void,
    } as any)

    const response = await Effect.runPromise(
      copypartyFoldersHandler.pipe(Effect.provide(layer)),
    )

    expect(response.status).toBe(502)
  })
})

describe("createFolderHandler", () => {
  it("creates folder and returns name", async () => {
    const response = await Effect.runPromise(
      createFolderHandler({ name: "NewSeries" }).pipe(Effect.provide(makeLayer())),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.name).toBe("NewSeries")
  })

  it("returns 502 on error", async () => {
    const response = await Effect.runPromise(
      createFolderHandler({ name: "Bad" }).pipe(
        Effect.provide(makeLayer({ createOk: false })),
      ),
    )

    expect(response.status).toBe(502)
    const body = await response.json() as any
    expect(body.error).toBe("Create failed")
  })
})

describe("deleteFolderHandler", () => {
  it("deletes folder and returns name", async () => {
    const response = await Effect.runPromise(
      deleteFolderHandler({ name: "OldSeries" }).pipe(Effect.provide(makeLayer())),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.name).toBe("OldSeries")
  })

  it("returns 502 on error", async () => {
    const response = await Effect.runPromise(
      deleteFolderHandler({ name: "Bad" }).pipe(
        Effect.provide(makeLayer({ deleteOk: false })),
      ),
    )

    expect(response.status).toBe(502)
    const body = await response.json() as any
    expect(body.error).toBe("Delete failed")
  })
})
