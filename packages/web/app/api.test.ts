import { Effect, Exit, Layer } from "effect"
import {
  HttpClient,
  HttpClientError,
  type HttpClientRequest,
  HttpClientResponse,
} from "effect/http"
import { describe, expect, test } from "vitest"

import { ApiClientService, ApiFailure, callApi, describeError, resolveBases } from "./api"

describe("resolveBases", () => {
  test("dev talks to the Bun server directly", () => {
    expect(resolveBases(true, { protocol: "http:", host: "localhost:5173" })).toStrictEqual({
      http: "http://localhost:3000",
      ws: "ws://localhost:3000",
    })
  })

  test("prod is same-origin, with ws/wss following the page protocol", () => {
    expect(resolveBases(false, { protocol: "http:", host: "inkpipe.lan" })).toStrictEqual({
      http: "",
      ws: "ws://inkpipe.lan",
    })
    expect(resolveBases(false, { protocol: "https:", host: "inkpipe.example" })).toStrictEqual({
      http: "",
      ws: "wss://inkpipe.example",
    })
  })
})

describe("describeError", () => {
  test("uses the message of anything that has one", () => {
    expect(describeError({ message: "boom" })).toBe("boom")
    expect(describeError(new Error("nope"))).toBe("nope")
  })

  test("falls back for everything else, including empty messages", () => {
    expect(describeError("string")).toBe("Something went wrong")
    expect(describeError(undefined)).toBe("Something went wrong")
    expect(describeError({ message: "" })).toBe("Something went wrong")
    expect(describeError({ message: 42 })).toBe("Something went wrong")
  })
})

type Stub = (request: HttpClientRequest.HttpClientRequest) => Response | Error

const run = <A, E>(
  stub: Stub,
  requests: Array<HttpClientRequest.HttpClientRequest>,
  program: Effect.Effect<A, E, ApiClientService>,
) => {
  const httpClient = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      requests.push(request)
      const result = stub(request)
      return result instanceof Error
        ? Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({ request, cause: result }),
            }),
          )
        : Effect.succeed(HttpClientResponse.fromWeb(request, result))
    }),
  )
  const layer = ApiClientService.layer("http://api.test").pipe(Layer.provide(httpClient))
  return Effect.runPromiseExit(program.pipe(Effect.provide(layer)))
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const failureOf = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.flatMap((r) => (r._tag === "Fail" ? [r.error] : []))[0]
    : undefined

describe("callApi", () => {
  test("calls the typed client against the configured base URL and decodes the body", async () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = []
    const exit = await run(
      () => json(200, { jobs: [] }),
      requests,
      callApi((c) => c.jobs.list()),
    )

    expect(Exit.isSuccess(exit) && exit.value).toStrictEqual({ jobs: [] })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.method).toBe("GET")
    expect(requests[0]?.url).toBe("http://api.test/api/jobs")
  })

  test("sends no trace-propagation headers (CORS would reject b3)", async () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = []
    await run(
      () => json(200, { jobs: [] }),
      requests,
      callApi((c) => c.jobs.list()),
    )

    const names = Object.keys(requests[0]?.headers ?? {})
    expect(names).not.toContain("b3")
    expect(names).not.toContain("traceparent")
  })

  test("a typed server error becomes ApiFailure carrying the server's message", async () => {
    const exit = await run(
      () => json(503, { _tag: "ProwlarrNotConfigured", message: "Prowlarr is not configured" }),
      [],
      callApi((c) => c.search.search({ query: { q: "berserk" } })),
    )

    const failure = failureOf(exit)
    expect(failure).toBeInstanceOf(ApiFailure)
    expect(failure instanceof ApiFailure && failure.message).toBe("Prowlarr is not configured")
  })

  test("a transport failure becomes ApiFailure with a non-empty message", async () => {
    const exit = await run(
      () => new Error("offline"),
      [],
      callApi((c) => c.jobs.list()),
    )

    const failure = failureOf(exit)
    expect(failure).toBeInstanceOf(ApiFailure)
    expect(failure instanceof ApiFailure && failure.message.length > 0).toBe(true)
  })

  test("a body that does not match the schema fails with ApiFailure, not a defect", async () => {
    const exit = await run(
      () => json(200, { jobs: "nope" }),
      [],
      callApi((c) => c.jobs.list()),
    )
    expect(failureOf(exit)).toBeInstanceOf(ApiFailure)
  })

  test("an undeclared status (e.g. a reverse proxy's 502 HTML page) becomes ApiFailure", async () => {
    const exit = await run(
      () =>
        new Response("<html>Bad Gateway</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
      [],
      callApi((c) => c.jobs.list()),
    )
    const failure = failureOf(exit)
    expect(failure).toBeInstanceOf(ApiFailure)
    expect(failure instanceof ApiFailure && failure.message.length > 0).toBe(true)
  })

  test("a 200 whose body is not JSON becomes ApiFailure", async () => {
    const exit = await run(
      () =>
        new Response("not json", { status: 200, headers: { "content-type": "application/json" } }),
      [],
      callApi((c) => c.jobs.list()),
    )
    expect(failureOf(exit)).toBeInstanceOf(ApiFailure)
  })
})
