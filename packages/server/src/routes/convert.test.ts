import { Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { convertStartHandler, convertDownloadHandler } from "../routes/convert"
import { KccService } from "../layers/Kcc"
import { FileManagerService } from "../layers/FileManager"

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

describe("convertStartHandler", () => {
  it("returns 400 when no file provided", async () => {
    const formData = new FormData()

    const response = await Effect.runPromise(
      convertStartHandler(formData).pipe(Effect.provide(makeLayer())),
    )

    expect(response.status).toBe(400)
    const body = await response.json() as any
    expect(body.error).toBe("No file provided")
  })

  it("returns 400 when file is not a Blob", async () => {
    const formData = new FormData()
    formData.set("file", "not-a-file")

    const response = await Effect.runPromise(
      convertStartHandler(formData).pipe(Effect.provide(makeLayer())),
    )

    expect(response.status).toBe(400)
    const body = await response.json() as any
    expect(body.error).toBe("No file provided")
  })

  it("returns 400 when file extension is not .cbz", async () => {
    const formData = new FormData()
    formData.set("file", new Blob(["test"], { type: "application/epub+zip" }), "test.epub")

    const response = await Effect.runPromise(
      convertStartHandler(formData).pipe(Effect.provide(makeLayer())),
    )

    expect(response.status).toBe(400)
    const body = await response.json() as any
    expect(body.error).toBe("Only .cbz files are accepted")
  })

  it("returns id immediately on valid .cbz upload", async () => {
    const formData = new FormData()
    formData.set("file", new Blob(["test cbz content"]), "comic.cbz")

    const response = await Effect.runPromise(
      convertStartHandler(formData).pipe(Effect.provide(makeLayer())),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.id).toBeTypeOf("string")
  })
})

describe("convertDownloadHandler", () => {
  it("returns the EPUB file on success", async () => {
    const response = await Effect.runPromise(
      convertDownloadHandler("valid-id").pipe(Effect.provide(makeLayer())),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/epub+zip")
  })
})
