// Final HTTP-layer composition: typed HttpApi handlers + CORS middleware +
// the raw WebSocket / static-fallback routes, all mounted on one shared
// HttpRouter and ready to be provided the application's MainLayer.
import { Layer } from "effect"
import { HttpApiBuilder, HttpApiSwagger } from "effect/http-api"
import { HttpRouter } from "effect/http"
import { InkpipeApi } from "@inkpipe/shared"
import { SettingsGroupLive } from "./handlers/settings"
import { ConvertGroupLive } from "./handlers/convert"
import { JobsWsRouteLive, StaticFallbackRouteLive } from "./raw"
import { SchemaErrorMiddlewareLive } from "@inkpipe/shared"
import { metrics } from "./Metrics"
import { CapabilityHttp } from "./capabilityApi"

// Every group layer's build effect resolves endpoint middleware (including
// SchemaErrorMiddleware, applied API-wide in index.ts) from its own context
// at build time, so SchemaErrorMiddlewareLive must be provided to each group
// individually — merging it alongside them wouldn't cross-satisfy anything.
const HandlersLive = Layer.mergeAll(SettingsGroupLive, ConvertGroupLive).pipe(
  Layer.provide(SchemaErrorMiddlewareLive),
)

const CorsLive = HttpRouter.cors({
  allowedOrigins: ["*"],
  allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
})

const ApiLive = HttpApiBuilder.layer(InkpipeApi, { openapiPath: "/openapi.json" }).pipe(
  Layer.provide(HandlersLive),
)

// Routes derived from capability contracts (see ../capabilities). Handlers for those live next to
// their contracts, so this API needs no hand-written group.
const CapabilityApiLive = HttpApiBuilder.layer(CapabilityHttp.api, {
  openapiPath: "/openapi/capabilities.json",
}).pipe(Layer.provide(CapabilityHttp.layer))

const SwaggerLive = Layer.mergeAll(
  HttpApiSwagger.layer(InkpipeApi, { path: "/docs" }),
  HttpApiSwagger.layer(CapabilityHttp.api, { path: "/docs/capabilities" }),
)

// Order matters for readability only — the underlying router (find-my-way)
// resolves static/param routes ahead of the catch-all wildcard regardless of
// registration order, so the typed API and the /api/jobs/ws route always
// take priority over the static/SPA fallback.
const HttpAppLayer = Layer.mergeAll(
  ApiLive,
  CapabilityApiLive,
  SwaggerLive,
  JobsWsRouteLive,
  StaticFallbackRouteLive,
  CorsLive,
)

// `HttpRouter.serve` builds the shared router from `HttpAppLayer`, and turns
// it into a `Layer` that needs only `HttpServer.HttpServer` (provided by
// BunHttpServer in main.ts) plus this app's own service dependencies
// (provided by MainLayer).
export const HttpServerLive = HttpRouter.serve(HttpAppLayer, { middleware: metrics })
