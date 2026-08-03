import { Effect, Layer } from "effect"
import { describe, it, expect } from "@effect/vitest"
import {
  copypartyFoldersHandler,
  createFolderHandler,
  deleteFolderHandler,
} from "../routes/copyparty"
import { CopypartyService } from "../layers/integrations/Copyparty"

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
  it.effect("returns folders as JSON", () =>
    Effect.gen(function* () {
      const response = yield* copypartyFoldersHandler.pipe(Effect.provide(makeLayer()))

      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.folders).toEqual(["Manga", "Comics"])
    }))

  it.effect("returns 502 on error", () =>
    Effect.gen(function* () {
      const layer = Layer.succeed(CopypartyService, {
        listFolders: Effect.fail({ message: "Error" } as any),
        uploadFile: () => Effect.void,
        createFolder: () => Effect.void,
        deleteFolder: () => Effect.void,
      } as any)

      const response = yield* copypartyFoldersHandler.pipe(Effect.provide(layer))

      expect(response.status).toBe(502)
    }))
})

describe("createFolderHandler", () => {
  it.effect("creates folder and returns name", () =>
    Effect.gen(function* () {
      const response = yield* createFolderHandler({ name: "NewSeries" }).pipe(
        Effect.provide(makeLayer()),
      )

      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.name).toBe("NewSeries")
    }))

  it.effect("returns 502 on error", () =>
    Effect.gen(function* () {
      const response = yield* createFolderHandler({ name: "Bad" }).pipe(
        Effect.provide(makeLayer({ createOk: false })),
      )

      expect(response.status).toBe(502)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.error).toBe("Create failed")
    }))
})

describe("deleteFolderHandler", () => {
  it.effect("deletes folder and returns name", () =>
    Effect.gen(function* () {
      const response = yield* deleteFolderHandler({ name: "OldSeries" }).pipe(
        Effect.provide(makeLayer()),
      )

      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.name).toBe("OldSeries")
    }))

  it.effect("returns 502 on error", () =>
    Effect.gen(function* () {
      const response = yield* deleteFolderHandler({ name: "Bad" }).pipe(
        Effect.provide(makeLayer({ deleteOk: false })),
      )

      expect(response.status).toBe(502)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.error).toBe("Delete failed")
    }))
})
