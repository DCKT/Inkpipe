// MCP projection of the capability registry, served at /mcp. Off unless INKPIPE_MCP=true: it
// gives an agent every capability, including settings and deletions, and inkpipe has no auth.
import { toToolkit } from "@inkpipe/capability/to-toolkit"
import { Layer } from "effect"
import { McpProtocol, McpServer } from "effect/ai"
import { capabilities } from "../capabilities"

const projection = toToolkit(capabilities)

export const McpLive = McpServer.toolkit(projection.toolkit).pipe(
  Layer.provide(projection.layer),
  Layer.provide(
    McpServer.layerHttp({
      name: "inkpipe",
      path: "/mcp",
      protocols: [McpProtocol.v2025_06_18],
      version: "1.0.0",
    }),
  ),
)

export const mcpEnabled = (): boolean => process.env.INKPIPE_MCP === "true"
