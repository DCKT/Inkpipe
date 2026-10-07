// MCP projection of the capability registry, served at /mcp. It gives an agent every capability,
// including settings (API keys) and deletions, and inkpipe has no user accounts, so it stays off
// unless INKPIPE_MCP=true AND a bearer token is configured in INKPIPE_MCP_TOKEN.
import { toToolkit } from "@inkpipe/capability/to-toolkit"
import { Effect, Layer } from "effect"
import { McpProtocol, McpServer } from "effect/ai"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { capabilities } from "../capabilities"

const projection = toToolkit(capabilities)

/** The MCP tools with no authentication; production wraps them in `makeMcpLive`. */
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

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Scoped to the MCP routes (provided to them below) rather than global, so every route the MCP
// layer registers is gated no matter how the surrounding layers are ordered.
const bearerAuth = (token: string) =>
  HttpRouter.middleware((handler) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const supplied = request.headers["authorization"] ?? ""
      return constantTimeEqual(supplied, `Bearer ${token}`)
        ? yield* handler
        : HttpServerResponse.empty({ status: 401, headers: { "WWW-Authenticate": "Bearer" } })
    }),
  )

/** MCP tools behind a bearer token. */
export const makeMcpLive = (token: string) => McpLive.pipe(Layer.provide(bearerAuth(token).layer))

/** The token that must accompany MCP requests, or undefined when MCP is switched off. */
export const mcpToken = (): string | undefined => {
  if (process.env.INKPIPE_MCP !== "true") return undefined
  const token = process.env.INKPIPE_MCP_TOKEN
  if (token === undefined || token.length < 16) {
    console.warn(
      "INKPIPE_MCP=true ignored: set INKPIPE_MCP_TOKEN to a secret of at least 16 characters.",
    )
    return undefined
  }
  return token
}
