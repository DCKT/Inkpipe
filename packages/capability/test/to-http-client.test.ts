import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { HttpClientRequest } from "effect/http"

import {
  UnexpectedResponse,
  UnsupportedRequestValue,
  defineContract,
  toHttpClient,
} from "../src/index.js"

const MissingSchema = Schema.TaggedStruct("Missing", { message: Schema.String })

const get = defineContract("getThing", {
  description: "Read a thing",
  failure: MissingSchema,
  http: { method: "GET", path: "/things/:id" },
  input: Schema.Struct({ id: Schema.String, tags: Schema.optional(Schema.Array(Schema.String)) }),
  output: Schema.Struct({ id: Schema.String }),
})

const search = defineContract("search", {
  description: "Search things",
  failure: Schema.Never,
  http: { method: "GET", path: "/search" },
  input: Schema.Struct({ q: Schema.optional(Schema.String), page: Schema.optional(Schema.Finite) }),
  output: Schema.Struct({ ok: Schema.Boolean }),
})

const remove = defineContract("remove", {
  description: "Delete by name",
  failure: Schema.Never,
  http: { method: "DELETE", path: "/things" },
  input: Schema.Struct({ name: Schema.String }),
  output: Schema.Struct({ name: Schema.String }),
})

const create = defineContract("create", {
  description: "Create",
  failure: Schema.Never,
  http: { method: "POST", path: "/things" },
  input: Schema.Struct({ name: Schema.String }),
  output: Schema.Struct({ name: Schema.String }),
})

const nested = defineContract("nested", {
  description: "Takes a nested value in the query",
  failure: Schema.Never,
  http: { method: "GET", path: "/nested" },
  input: Schema.Struct({ filter: Schema.Struct({ a: Schema.String }) }),
  output: Schema.Struct({ ok: Schema.Boolean }),
})

const prefixed = defineContract("prefixed", {
  description: "Path params where one name prefixes another",
  failure: Schema.Never,
  http: { method: "GET", path: "/a/:idx/b/:id" },
  input: Schema.Struct({ idx: Schema.String, id: Schema.String }),
  output: Schema.Struct({ ok: Schema.Boolean }),
})

const client = toHttpClient([get, search, remove, create, nested, prefixed], {
  baseUrl: "http://host/",
})

// The client keeps query params on the request until it executes, so resolve them here.
const urlOf = (request: HttpClientRequest.HttpClientRequest): URL => {
  const url = HttpClientRequest.toUrl(request)
  if (url._tag === "None") throw new Error("request has no valid URL")
  return url.value
}

interface Seen {
  readonly request: HttpClientRequest.HttpClientRequest
}

const withResponse = (respond: () => Response) => {
  const seen: Seen[] = []
  const layer = HttpClient.make((request) => {
    seen.push({ request })
    return Effect.succeed(HttpClientResponse.fromWeb(request, respond()))
  })
  return {
    seen,
    run: <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
      effect.pipe(Effect.provideService(HttpClient.HttpClient, layer)),
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

describe("toHttpClient", () => {
  it.effect("substitutes path params by whole segment and joins the base URL once", () =>
    Effect.gen(function* () {
      const { seen, run } = withResponse(() => json({ ok: true }))
      yield* run(client.prefixed({ idx: "1", id: "2 3" }))
      expect(urlOf(seen[0]!.request).toString()).toBe("http://host/a/1/b/2%203")
    }),
  )

  it.effect("sends list values as repeated params and skips empty lists and undefined", () =>
    Effect.gen(function* () {
      const { seen, run } = withResponse(() => json({ id: "x" }))
      yield* run(client.getThing({ id: "x", tags: ["a", "b"] }))
      yield* run(client.getThing({ id: "x", tags: [] }))
      yield* run(client.getThing({ id: "x" }))
      expect(urlOf(seen[0]!.request).searchParams.getAll("tags")).toEqual(["a", "b"])
      expect(urlOf(seen[1]!.request).search).toBe("")
      expect(urlOf(seen[2]!.request).search).toBe("")
    }),
  )

  it.effect("sends numbers as strings in the query and never as a body on GET", () =>
    Effect.gen(function* () {
      const { seen, run } = withResponse(() => json({ ok: true }))
      yield* run(client.search({ q: "one piece", page: 2 }))
      const request = seen[0]!.request
      expect(request.method).toBe("GET")
      expect(urlOf(request).searchParams.get("q")).toBe("one piece")
      expect(urlOf(request).searchParams.get("page")).toBe("2")
      expect(request.body._tag).toBe("Empty")
    }),
  )

  it.effect("DELETE carries its input in the query string, not a body", () =>
    Effect.gen(function* () {
      const { seen, run } = withResponse(() => json({ name: "old & new" }))
      const result = yield* run(client.remove({ name: "old & new" }))
      const request = seen[0]!.request
      expect(request.method).toBe("DELETE")
      expect(urlOf(request).searchParams.get("name")).toBe("old & new")
      expect(request.body._tag).toBe("Empty")
      expect(result).toEqual({ name: "old & new" })
    }),
  )

  it.effect("POST carries its input as a JSON body", () =>
    Effect.gen(function* () {
      const { seen, run } = withResponse(() => json({ name: "n" }))
      yield* run(client.create({ name: "n" }))
      const request = seen[0]!.request
      expect(request.method).toBe("POST")
      expect(request.body._tag).toBe("Uint8Array")
      expect(urlOf(request).search).toBe("")
    }),
  )

  it.effect("refuses a query value that cannot round-trip instead of sending garbage", () =>
    Effect.gen(function* () {
      const { seen, run } = withResponse(() => json({ ok: true }))
      const error = yield* run(client.nested({ filter: { a: "1" } })).pipe(Effect.flip)
      expect(error).toBeInstanceOf(UnsupportedRequestValue)
      expect(seen).toHaveLength(0)
    }),
  )

  it.effect("decodes a declared failure from an error response", () =>
    Effect.gen(function* () {
      const { run } = withResponse(() => json({ _tag: "Missing", message: "no such thing" }, 404))
      const error = yield* run(client.getThing({ id: "x" })).pipe(Effect.flip)
      expect(error).toEqual({ _tag: "Missing", message: "no such thing" })
    }),
  )

  it.effect(
    "reports an undeclared error response as UnexpectedResponse with the server message",
    () =>
      Effect.gen(function* () {
        const { run } = withResponse(() => json({ message: "boom" }, 500))
        const error = yield* run(client.getThing({ id: "x" })).pipe(Effect.flip)
        expect(error).toBeInstanceOf(UnexpectedResponse)
        expect(error).toMatchObject({ status: 500, message: "boom" })
      }),
  )

  it.effect(
    "reports a non-JSON success (such as an HTML fallback page) as UnexpectedResponse",
    () =>
      Effect.gen(function* () {
        const { run } = withResponse(
          () =>
            new Response("<html></html>", {
              status: 200,
              headers: { "content-type": "text/html" },
            }),
        )
        const error = yield* run(client.getThing({ id: "x" })).pipe(Effect.flip)
        expect(error).toBeInstanceOf(UnexpectedResponse)
        expect(error).toMatchObject({ status: 200 })
      }),
  )

  it.effect("rejects a success body that does not match the output schema", () =>
    Effect.gen(function* () {
      const { run } = withResponse(() => json({ wrong: true }))
      const error = yield* run(client.getThing({ id: "x" })).pipe(Effect.flip)
      expect(Schema.isSchemaError(error)).toBe(true)
    }),
  )
})
