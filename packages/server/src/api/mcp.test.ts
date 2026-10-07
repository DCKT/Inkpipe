// The MCP projection serves every capability as a tool, backed by the same handlers as HTTP.
import { Effect, Layer, Logger, References } from "effect"
import { describe, it, expect } from "@effect/vitest"
import { constVoid } from "effect/Function"
import { HttpRouter } from "effect/http"
import { capabilities } from "../capabilities"
import { JobStoreService } from "../layers/storage/JobStore"
import { McpLive, makeMcpLive } from "./mcp"
import { makeMcpClient } from "./mcp-harness"

const jobStore = Layer.succeed(JobStoreService, {
  createJob: () => Effect.die("unused"),
  updateJob: () => Effect.void,
  getJob: () => Effect.die("unused"),
  getAllJobs: Effect.succeed([]),
  deleteCompletedJobs: Effect.succeed(2),
} as typeof JobStoreService.Service)

const quiet = Layer.succeed(References.CurrentLoggers, new Set([Logger.make(constVoid)]))

// oxlint-disable-next-line typescript/no-explicit-any -- only the job store is provided; other capabilities are listed, not called.
const appLayer: any = McpLive.pipe(Layer.provideMerge(jobStore), Layer.provideMerge(quiet))

describe("MCP projection", () => {
  it.effect("lists every capability as a tool, with annotations from its contract", () =>
    Effect.gen(function* () {
      const client = yield* makeMcpClient(appLayer)
      const { tools } = yield* client["tools/list"]({})

      expect(tools.map((tool) => tool.name).sort()).toEqual(
        capabilities.map(({ contract }) => contract.name).sort(),
      )
      const clear = tools.find((tool) => tool.name === "clearJobs")
      expect(clear?.annotations?.destructiveHint).toBe(true)
      expect(tools.find((tool) => tool.name === "listJobs")?.annotations?.readOnlyHint).toBe(true)
    }),
  )

  it.effect("calls a capability handler through the toolkit", () =>
    Effect.gen(function* () {
      const client = yield* makeMcpClient(appLayer)
      const result = yield* client["tools/call"]({ arguments: {}, name: "clearJobs" })

      expect(result.isError).toBeFalsy()
      const [content] = result.content
      expect(content?.type === "text" ? content.text : "").toContain("2")
    }),
  )

  describe("bearer token gate", () => {
    const token = "a-secret-token-of-16-plus-chars"
    // oxlint-disable-next-line typescript/no-explicit-any -- only the job store is provided.
    const gated: any = makeMcpLive(token).pipe(
      Layer.provideMerge(jobStore),
      Layer.provideMerge(quiet),
    )
    const post = (headers: Record<string, string>) => {
      const { handler, dispose } = HttpRouter.toWebHandler(gated, { disableLogger: true })
      const init = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "t", version: "1" },
        },
      }
      return Effect.promise(async () => {
        const response = await handler(
          new Request("http://localhost/mcp", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json, text/event-stream",
              ...headers,
            },
            body: JSON.stringify(init),
          }),
        )
        await dispose()
        return response.status
      })
    }

    it.effect("rejects a request with no credentials", () =>
      Effect.gen(function* () {
        expect(yield* post({})).toBe(401)
      }),
    )

    it.effect("rejects a wrong token", () =>
      Effect.gen(function* () {
        expect(yield* post({ authorization: "Bearer nope" })).toBe(401)
        expect(yield* post({ authorization: token })).toBe(401)
      }),
    )

    it.effect("lets the right token through to the MCP server", () =>
      Effect.gen(function* () {
        const status = yield* post({ authorization: `Bearer ${token}` })
        expect(status).toBeLessThan(300)
      }),
    )
  })
})
