import { Effect, Layer } from "effect"
import { expect, beforeEach, afterEach, layer } from "@effect/vitest"
// `vi.mock` relies on Vitest's static hoisting transform, which only
// recognizes the import when `vi` comes directly from "vitest" (not via the
// `@effect/vitest` re-export) — importing it from "@effect/vitest" here
// causes a "Cannot access '__vi_import_N__' before initialization" error.
import { vi } from "vitest"
import { convertStartHandler, convertDownloadHandler } from "../routes/convert"
import { KccService } from "../layers/integrations/Kcc"
import { FileManagerService } from "../layers/pipeline/FileManager"

function makeLayer() {
  return Layer.mergeAll(
    Layer.succeed(KccService, {
      convert: () => Effect.succeed("OK"),
    } as any),
    Layer.succeed(FileManagerService, {
      getTempBase: Effect.succeed("/tmp/inkpipe"),
      isRunningInDocker: Effect.succeed(false),
      ensureJobDir: () => Effect.succeed("/tmp/inkpipe/1"),
      cleanupJobDir: () => Effect.void,
      findFileByExtension: () => Effect.succeed(null),
      findAllFilesByExtension: () => Effect.succeed([]),
      extractRarArchive: () => Effect.succeed("/tmp/inkpipe/1/extracted"),
    } as any),
  )
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.mock("node:fs/promises", () => ({
    writeFile: vi.fn(() => Promise.resolve()),
    readdir: vi.fn(() => Promise.resolve(["output.epub"])),
    mkdir: vi.fn(() => Promise.resolve()),
    readFile: vi.fn(() => Promise.resolve(Buffer.from("epub content"))),
    rm: vi.fn(() => Promise.resolve()),
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

layer(makeLayer())("convertStartHandler", (it) => {
  it.effect("returns 400 when no file provided", () =>
    Effect.gen(function* () {
      const formData = new FormData()

      const response = yield* convertStartHandler(formData)

      expect(response.status).toBe(400)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.error).toBe("No file provided")
    }))

  it.effect("returns 400 when file is not a Blob", () =>
    Effect.gen(function* () {
      const formData = new FormData()
      formData.set("file", "not-a-file")

      const response = yield* convertStartHandler(formData)

      expect(response.status).toBe(400)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.error).toBe("No file provided")
    }))

  it.effect("returns 400 when file extension is not .cbz", () =>
    Effect.gen(function* () {
      const formData = new FormData()
      formData.set("file", new Blob(["test"], { type: "application/epub+zip" }), "test.epub")

      const response = yield* convertStartHandler(formData)

      expect(response.status).toBe(400)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.error).toBe("Only .cbz files are accepted")
    }))

  it.effect("returns id immediately on valid .cbz upload", () =>
    Effect.gen(function* () {
      const formData = new FormData()
      formData.set("file", new Blob(["test cbz content"]), "comic.cbz")

      const response = yield* convertStartHandler(formData)

      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.id).toBeTypeOf("string")
    }))
})

layer(makeLayer())("convertDownloadHandler", (it) => {
  it.effect("returns the EPUB file on success", () =>
    Effect.gen(function* () {
      const response = yield* convertDownloadHandler("valid-id")

      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe("application/epub+zip")
    }))
})
