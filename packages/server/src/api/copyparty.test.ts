// Drives the capability-derived Copyparty routes end to end: the real handlers, the real
// toHttpApi projection, and the contracts-only client the browser uses.
import { Effect, Layer } from "effect"
import { describe, it, expect } from "@effect/vitest"
import { HttpApiBuilder } from "effect/http-api"
import { FetchHttpClient, HttpRouter } from "effect/http"
import type { HttpClient } from "effect/http"
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import { toHttpClient } from "@inkpipe/capability/to-http-client"
import { CopypartyFolderError, CopypartyNotConfigured, copypartyContracts } from "@inkpipe/shared"
import { CopypartyService } from "../layers/integrations/Copyparty"
import { CapabilityHttp } from "./capabilityApi"

type CopypartyShape = typeof CopypartyService.Service

const makeFetch = (overrides: Partial<CopypartyShape> = {}) => {
  const service = Layer.succeed(CopypartyService, {
    listFolders: Effect.succeed(["manga", "books"]),
    createFolder: () => Effect.void,
    deleteFolder: () => Effect.void,
    uploadFile: () => Effect.void,
    ...overrides,
  } as CopypartyShape)
  const ApiLive: any = HttpApiBuilder.layer(CapabilityHttp.api).pipe(
    Layer.provide(CapabilityHttp.layer),
    Layer.provide(service),
    Layer.provide(BunHttpServer.layerHttpServices),
  )
  const { handler } = HttpRouter.toWebHandler(ApiLive)
  return handler as (request: Request) => Promise<Response>
}

// Routes the client's fetches straight into the in-process web handler.
const clientFor = (handler: (request: Request) => Promise<Response>) => {
  const fetchLayer = Layer.succeed(FetchHttpClient.Fetch, ((input: any, init?: any) =>
    handler(new Request(input, init))) as typeof fetch)
  return {
    client: toHttpClient(copypartyContracts, { baseUrl: "http://localhost" }),
    layer: FetchHttpClient.layer.pipe(Layer.provide(fetchLayer)),
  }
}

describe("copyparty capabilities", () => {
  it("GET /api/copyparty/folders returns { folders }", async () => {
    const res = await makeFetch()(new Request("http://localhost/api/copyparty/folders"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ folders: ["manga", "books"] })
  })

  it("answers a declared failure with its mapped status and body", async () => {
    const res = await makeFetch({
      listFolders: Effect.fail(new CopypartyNotConfigured({ message: "nope" })),
    })(new Request("http://localhost/api/copyparty/folders"))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ _tag: "CopypartyNotConfigured", message: "nope" })
  })

  it("rejects a bad request body with the shared validation shape", async () => {
    const res = await makeFetch()(
      new Request("http://localhost/api/copyparty/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wrong: true }),
      }),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ _tag: "RequestValidationError" })
  })

  it("DELETE takes the folder name from the query string", async () => {
    const seen: string[] = []
    const res = await makeFetch({
      deleteFolder: (name: string) => Effect.sync(() => void seen.push(name)),
    })(new Request("http://localhost/api/copyparty/folders?name=old", { method: "DELETE" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: "old" })
    expect(seen).toEqual(["old"])
  })

  it.effect("the contracts-only client round-trips input, output and typed failures", () =>
    Effect.gen(function* () {
      const handler = makeFetch({
        createFolder: (name: string) =>
          name === "bad"
            ? Effect.fail(new CopypartyFolderError({ message: "exists" }))
            : Effect.void,
      })
      const { client, layer } = clientFor(handler)
      const run = <A, E>(effect: Effect.Effect<A, E, HttpClient.HttpClient>) =>
        effect.pipe(Effect.provide(layer))

      expect(yield* run(client.listFolders({}))).toEqual({ folders: ["manga", "books"] })
      expect(yield* run(client.createFolder({ name: "new" }))).toEqual({ name: "new" })
      const failure = yield* run(client.createFolder({ name: "bad" })).pipe(Effect.flip)
      expect(failure).toMatchObject({ _tag: "CopypartyFolderError", message: "exists" })
    }),
  )
})
