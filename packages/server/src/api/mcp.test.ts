// The MCP projection serves every capability as a tool, backed by the same handlers as HTTP.
import { Effect, Layer, Logger, References } from "effect"
import { describe, it, expect } from "@effect/vitest"
import { constVoid } from "effect/Function"
import { capabilities } from "../capabilities"
import { JobStoreService } from "../layers/storage/JobStore"
import { McpLive } from "./mcp"
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
})
