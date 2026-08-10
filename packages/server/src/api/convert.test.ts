// Exercises the real ConvertGroupLive handler (not a reimplementation) —
// the in-memory job registry, SSE framing, multipart upload, path-traversal
// sanitization (basename() fix), and the download-not-found status fix, all
// from this session — through the real HTTP layer. KccService is mocked;
// FileManagerService.getTempBase points at a real scratch temp dir so the
// handler's direct node:fs/promises calls (mkdir/copyFile/readdir/rm) run
// against real files, cleaned up after each test.
import { Effect, Layer } from "effect"
import { describe, it, expect, beforeEach, afterEach } from "@effect/vitest"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpRouter } from "effect/unstable/http"
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { KccService } from "../layers/integrations/Kcc"
import { FileManagerService } from "../layers/pipeline/FileManager"
import { ConvertGroup } from "@inkpipe/shared/httpApi/groups/convert"
import { ConvertGroupLive } from "./handlers/convert"
import { SchemaErrorMiddleware, SchemaErrorMiddlewareLive } from "@inkpipe/shared"

const TestApi = HttpApi.make("test").add(ConvertGroup).middleware(SchemaErrorMiddleware)

type KccConvert = (inputPath: string, outputDir: string, overrides?: unknown, onLog?: (line: string) => void) => Effect.Effect<string, unknown>

let tempBase: string

beforeEach(async () => {
  tempBase = await mkdtemp(join(tmpdir(), "inkpipe-convert-test-"))
})

afterEach(async () => {
  await rm(tempBase, { recursive: true, force: true })
})

function makeHandler(kccConvert: KccConvert) {
  const KccLive = Layer.succeed(KccService, { convert: kccConvert } as any)
  const FileManagerLive = Layer.succeed(FileManagerService, {
    getTempBase: Effect.succeed(tempBase),
  } as any)
  const ConvertGroupWithDeps: any = ConvertGroupLive.pipe(
    Layer.provide(SchemaErrorMiddlewareLive),
    Layer.provide(KccLive),
    Layer.provide(FileManagerLive),
  )
  const ApiLive = HttpApiBuilder.layer(TestApi).pipe(Layer.provide(ConvertGroupWithDeps))
  const AppLayer: any = ApiLive.pipe(Layer.provide(BunHttpServer.layerHttpServices))
  const { handler } = HttpRouter.toWebHandler(AppLayer)
  return handler as (request: Request) => Promise<Response>
}

function multipartRequest(filename: string, options?: string) {
  const form = new FormData()
  form.set("file", new Blob([new Uint8Array([1, 2, 3])]), filename)
  if (options !== undefined) form.set("options", options)
  return new Request("http://localhost/api/convert/start", { method: "POST", body: form })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("convert API", () => {
  it("start rejects a non-.cbz file with 400 ConvertError", async () => {
    const handler = makeHandler(() => Effect.succeed(""))
    const res = await handler(multipartRequest("book.pdf"))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { _tag: string; message: string }
    expect(body._tag).toBe("ConvertError")
    expect(body.message).toContain(".cbz")
  })

  it("start rejects malformed KCC options JSON with 400 ConvertError", async () => {
    const handler = makeHandler(() => Effect.succeed(""))
    const res = await handler(multipartRequest("book.cbz", "{not json"))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { _tag: string }
    expect(body._tag).toBe("ConvertError")
  })

  it("start sanitizes a path-traversal filename to its basename before copying", async () => {
    let capturedInputPath = ""
    const handler = makeHandler((inputPath) => {
      capturedInputPath = inputPath
      return Effect.succeed("")
    })

    const res = await handler(multipartRequest("../../../../etc/evil.cbz"))
    expect(res.status).toBe(200)
    await sleep(50)

    expect(capturedInputPath).toContain("evil.cbz")
    expect(capturedInputPath).not.toContain("..")
    expect(capturedInputPath.startsWith(tempBase)).toBe(true)
  })

  it("progress returns 404 for an unknown job id", async () => {
    const handler = makeHandler(() => Effect.succeed(""))
    const res = await handler(new Request("http://localhost/api/convert/progress?id=nope"))
    expect(res.status).toBe(404)
  })

  it("download returns 404 NotFoundError for an unknown job id", async () => {
    const handler = makeHandler(() => Effect.succeed(""))
    const res = await handler(new Request("http://localhost/api/convert/download?id=nope"))
    expect(res.status).toBe(404)
    const body = (await res.json()) as { _tag: string }
    expect(body._tag).toBe("NotFoundError")
  })

  it("download returns 400 ConvertError while the job is still running", async () => {
    const handler = makeHandler(() => Effect.never)
    const startRes = await handler(multipartRequest("book.cbz"))
    const { id } = (await startRes.json()) as { id: string }

    const res = await handler(new Request(`http://localhost/api/convert/download?id=${id}`))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { _tag: string }
    expect(body._tag).toBe("ConvertError")
  })

  it("full happy path: start -> progress reports done -> download returns the EPUB and then 404s", async () => {
    const handler = makeHandler((_inputPath, outputDir) =>
      Effect.promise(async () => {
        const { writeFile } = await import("node:fs/promises")
        await writeFile(join(outputDir, "book.epub"), "epub-bytes")
        return ""
      }),
    )

    const startRes = await handler(multipartRequest("book.cbz"))
    expect(startRes.status).toBe(200)
    const { id } = (await startRes.json()) as { id: string }

    await sleep(100)

    const progressRes = await handler(new Request(`http://localhost/api/convert/progress?id=${id}`))
    expect(progressRes.status).toBe(200)
    const sse = await progressRes.text()
    expect(sse).toContain("event: done")
    expect(sse).toContain("book.epub")

    const downloadRes = await handler(new Request(`http://localhost/api/convert/download?id=${id}`))
    expect(downloadRes.status).toBe(200)
    expect(downloadRes.headers.get("content-type")).toBe("application/epub+zip")
    const bytes = new TextDecoder().decode(await downloadRes.arrayBuffer())
    expect(bytes).toBe("epub-bytes")

    // The handler deletes the job + work dir after a successful download.
    const secondDownload = await handler(new Request(`http://localhost/api/convert/download?id=${id}`))
    expect(secondDownload.status).toBe(404)
  })

  it("marks the job as error and reports it over SSE when KCC produces no EPUB", async () => {
    const handler = makeHandler(() => Effect.succeed(""))
    const startRes = await handler(multipartRequest("book.cbz"))
    const { id } = (await startRes.json()) as { id: string }

    await sleep(100)

    const progressRes = await handler(new Request(`http://localhost/api/convert/progress?id=${id}`))
    const sse = await progressRes.text()
    expect(sse).toContain("event: error")
    expect(sse).toContain("did not produce an EPUB")
  })
})
