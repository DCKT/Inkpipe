import { Effect } from "effect"
import { writeFile, readdir, mkdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { KccService } from "../layers/Kcc"
import { FileManagerService } from "../layers/FileManager"

export const convertUploadHandler = (formData: FormData) =>
  Effect.gen(function* () {
    const file = formData.get("file")
    if (!file || !(file instanceof Blob)) {
      return yield* Effect.fail(new Error("No file provided"))
    }

    const filename = file.name || "unknown"
    const ext = filename.toLowerCase().split(".").pop()
    if (ext !== "cbz") {
      return yield* Effect.fail(new Error("Only .cbz files are accepted"))
    }

    const id = randomUUID()
    const fileManager = yield* FileManagerService
    const tempBase = yield* fileManager.getTempBase
    const workDir = join(tempBase, `convert-${id}`)

    yield* Effect.promise(() => mkdir(workDir, { recursive: true }))

    const inputPath = join(workDir, filename)
    const arrayBuffer = yield* Effect.promise(() => file.arrayBuffer())
    yield* Effect.promise(() => writeFile(inputPath, Buffer.from(arrayBuffer)))

    const kcc = yield* KccService
    yield* kcc.convert(inputPath, workDir)

    const files = yield* Effect.promise(() => readdir(workDir))
    const epubFile = files.find((f) => f.toLowerCase().endsWith(".epub"))
    if (!epubFile) {
      return yield* Effect.fail(new Error("KCC did not produce an EPUB file"))
    }

    return Response.json({ id, filename: epubFile })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 400 }),
      ),
    ),
  )

export const convertDownloadHandler = (id: string) =>
  Effect.gen(function* () {
    const fileManager = yield* FileManagerService
    const tempBase = yield* fileManager.getTempBase
    const workDir = join(tempBase, `convert-${id}`)

    let epubFile: string | undefined
    const files = yield* Effect.promise(() =>
      readdir(workDir).catch(() => {
        throw new Error("Conversion not found")
      }),
    )
    epubFile = files.find((f) => f.toLowerCase().endsWith(".epub"))

    if (!epubFile) {
      yield* Effect.promise(() =>
        rm(workDir, { recursive: true, force: true }).catch(() => {}),
      )
      return yield* Effect.fail(new Error("EPUB not found"))
    }

    const filePath = join(workDir, epubFile)
    const fileBuffer = yield* Effect.promise(() => readFile(filePath))

    yield* Effect.promise(() =>
      rm(workDir, { recursive: true, force: true }).catch(() => {}),
    )

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(epubFile)}"`,
        "Content-Length": String(fileBuffer.byteLength),
      },
    })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 404 }),
      ),
    ),
  )
