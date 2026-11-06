import { Effect, Exit, Layer, Option } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { afterEach, describe, expect, test, vi } from "vitest"

import { ApiClientService, ApiFailure } from "./api"
import {
  type EventSourceLike,
  awaitConversion,
  fetchResult,
  parseSseMessage,
  progressUrl,
  resultPath,
  uploadFile,
} from "./convertFlow"

afterEach(() => {
  vi.unstubAllGlobals()
})

const failureOf = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.flatMap((r) => (r._tag === "Fail" ? [r.error] : []))[0]
    : undefined

describe("urls and SSE parsing", () => {
  test("ids are URL-encoded", () => {
    expect(progressUrl("http://x", "a b/c")).toBe("http://x/api/convert/progress?id=a%20b%2Fc")
    expect(resultPath("a b")).toBe("/api/convert/download?id=a%20b")
  })

  test("parseSseMessage reads {message} and nothing else", () => {
    expect(parseSseMessage('{"message":"Berserk.epub"}')).toStrictEqual(Option.some("Berserk.epub"))
    expect(parseSseMessage("not json")).toStrictEqual(Option.none())
    expect(parseSseMessage('{"nope":1}')).toStrictEqual(Option.none())
    expect(parseSseMessage(undefined)).toStrictEqual(Option.none())
  })
})

class FakeEventSource extends EventTarget {
  closed = false
  constructor(readonly url: string) {
    super()
  }
  emit(type: string, data?: string) {
    this.dispatchEvent(data === undefined ? new Event(type) : new MessageEvent(type, { data }))
  }
  close() {
    this.closed = true
  }
}

describe("awaitConversion", () => {
  const run = (script: (source: FakeEventSource) => void) => {
    let created: FakeEventSource | undefined
    const open = (url: string): EventSourceLike => {
      created = new FakeEventSource(url)
      queueMicrotask(() => created && script(created))
      return created
    }
    return Effect.runPromiseExit(awaitConversion("job 1", open)).then((exit) => ({
      exit,
      source: created,
    }))
  }

  test("resolves with the converted file's name on `done` and closes the connection", async () => {
    const { exit, source } = await run((s) => s.emit("done", '{"message":"Berserk.epub"}'))
    expect(exit).toStrictEqual(Exit.succeed("Berserk.epub"))
    expect(source?.closed).toBe(true)
    expect(source?.url).toContain("/api/convert/progress?id=job%201")
  })

  test("fails with the server's message on an `error` event that carries one", async () => {
    const { exit, source } = await run((s) => s.emit("error", '{"message":"KCC exploded"}'))
    expect(failureOf(exit)).toBeInstanceOf(ApiFailure)
    expect(failureOf(exit)).toHaveProperty("message", "KCC exploded")
    expect(source?.closed).toBe(true)
  })

  test("a dropped connection (error without data) gets a generic message", async () => {
    const { exit } = await run((s) => s.emit("error"))
    expect(failureOf(exit)).toStrictEqual(
      new ApiFailure({ message: "Connection lost during conversion" }),
    )
  })

  test("a `done` with garbage data fails instead of resolving with nothing", async () => {
    const { exit } = await run((s) => s.emit("done", "???"))
    expect(failureOf(exit)).toBeInstanceOf(ApiFailure)
  })

  test("interrupting closes the connection", async () => {
    let created: FakeEventSource | undefined
    const fiber = Effect.runFork(
      awaitConversion("x", (url) => {
        created = new FakeEventSource(url)
        return created
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Effect.runPromise(Effect.sync(() => fiber.interruptUnsafe()))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(created?.closed).toBe(true)
  })
})

describe("fetchResult", () => {
  test("returns the file's bytes", async () => {
    vi.stubGlobal("fetch", async () => new Response("epub-bytes", { status: 200 }))
    const blob = await Effect.runPromise(fetchResult("1"))
    expect(await blob.text()).toBe("epub-bytes")
  })

  test("a non-OK answer names the status", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 404 }))
    const failure = failureOf(await Effect.runPromiseExit(fetchResult("1")))
    expect(failure).toBeInstanceOf(ApiFailure)
    expect(failure).toHaveProperty("message", "The server answered 404")
  })

  test("a network failure is reported plainly", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline")
    })
    const failure = failureOf(await Effect.runPromiseExit(fetchResult("1")))
    expect(failure).toBeInstanceOf(ApiFailure)
    expect(failure).toHaveProperty("message", "Could not reach the server")
  })
})

describe("uploadFile", () => {
  const run = (
    respond: () => Response,
    seen: Array<HttpClientRequest.HttpClientRequest>,
    options: Option.Option<string>,
  ) => {
    const httpClient = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => {
        seen.push(request)
        return Effect.succeed(HttpClientResponse.fromWeb(request, respond()))
      }),
    )
    const layer = ApiClientService.layer("http://api.test").pipe(Layer.provide(httpClient))
    return Effect.runPromiseExit(
      uploadFile(new File(["x"], "b.cbz"), options).pipe(Effect.provide(layer)),
    )
  }
  const json = (status: number, body: unknown) => () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

  test("posts multipart to the convert endpoint and returns the job id", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const exit = await run(json(200, { id: "job-1" }), seen, Option.some('{"profile":"KoBO"}'))
    expect(exit).toStrictEqual(Exit.succeed("job-1"))
    expect(seen[0]?.method).toBe("POST")
    expect(seen[0]?.url).toBe("http://api.test/api/convert/start")
    const body = seen[0]?.body
    expect(body?._tag).toBe("FormData")
    const form = body?._tag === "FormData" ? body.formData : undefined
    expect(form?.get("file")).toBeInstanceOf(File)
    expect(form?.get("file") instanceof File && form.get("file")).toHaveProperty("name", "b.cbz")
    expect(form?.get("options")).toBe('{"profile":"KoBO"}')
  })

  test("a server rejection becomes an ApiFailure with its message", async () => {
    const exit = await run(
      json(400, { _tag: "ConvertError", message: "Not a CBZ" }),
      [],
      Option.none(),
    )
    expect(failureOf(exit)).toBeInstanceOf(ApiFailure)
    expect(failureOf(exit)).toHaveProperty("message", "Not a CBZ")
  })
})
