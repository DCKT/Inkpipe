// Final HTTP-layer composition: capability routes (derived from contracts), the raw routes that
// contracts cannot describe (convert upload/SSE/download, job WebSocket, static fallback) and CORS,
// all mounted on one shared HttpRouter and ready to be provided the application's MainLayer.
import { Layer } from "effect"
import { HttpApiBuilder, HttpApiSwagger } from "effect/http-api"
import { HttpRouter } from "effect/http"
import { ConvertRoutesLive } from "./convert-routes"
import { JobsWsRouteLive, StaticFallbackRouteLive } from "./raw"
import { metrics } from "./Metrics"
import { CapabilityHttp } from "./capabilityApi"
import { makeMcpLive, mcpToken } from "./mcp"

const CorsLive = HttpRouter.cors({
  allowedOrigins: ["*"],
  allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
})

// Routes derived from capability contracts (see ../capabilities). Handlers live next to their
// contracts, so no hand-written group exists.
const CapabilityApiLive = HttpApiBuilder.layer(CapabilityHttp.api, {
  openapiPath: "/openapi.json",
}).pipe(Layer.provide(CapabilityHttp.layer))

const SwaggerLive = HttpApiSwagger.layer(CapabilityHttp.api, { path: "/docs" })

const token = mcpToken()
const McpOptionalLive = token === undefined ? Layer.empty : makeMcpLive(token)

// Order matters for readability only — the underlying router (find-my-way)
// resolves static/param routes ahead of the catch-all wildcard regardless of
// registration order, so the API and the /api/jobs/ws route always
// take priority over the static/SPA fallback.
const HttpAppLayer = Layer.mergeAll(
  McpOptionalLive,
  CapabilityApiLive,
  SwaggerLive,
  ConvertRoutesLive,
  JobsWsRouteLive,
  StaticFallbackRouteLive,
  CorsLive,
)

// `HttpRouter.serve` builds the shared router from `HttpAppLayer`, and turns
// it into a `Layer` that needs only `HttpServer.HttpServer` (provided by
// BunHttpServer in main.ts) plus this app's own service dependencies
// (provided by MainLayer).
export const HttpServerLive = HttpRouter.serve(HttpAppLayer, { middleware: metrics })
