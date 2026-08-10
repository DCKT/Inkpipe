// Final HTTP-layer composition: typed HttpApi handlers + CORS middleware +
// the raw WebSocket / static-fallback routes, all mounted on one shared
// HttpRouter and ready to be provided the application's MainLayer.
import { Layer } from "effect"
import { HttpApiBuilder, HttpApiSwagger } from "effect/unstable/httpapi"
import { HttpRouter } from "effect/unstable/http"
import { InkpipeApi } from "@inkpipe/shared"
import { SearchGroupLive } from "./handlers/search"
import { LatestGroupLive } from "./handlers/latest"
import { DownloadGroupLive } from "./handlers/download"
import { AllDebridGroupLive } from "./handlers/alldebrid"
import { AnnasArchiveGroupLive } from "./handlers/annas-archive"
import { JobsGroupLive } from "./handlers/jobs"
import { SettingsGroupLive } from "./handlers/settings"
import { ConvertGroupLive } from "./handlers/convert"
import { KomgaGroupLive } from "./handlers/komga"
import { CopypartyGroupLive } from "./handlers/copyparty"
import { WatchesGroupLive } from "./handlers/watches"
import { PushGroupLive } from "./handlers/push"
import { JobsWsRouteLive, StaticFallbackRouteLive } from "./raw"
import { SchemaErrorMiddlewareLive } from "@inkpipe/shared"

// Every group layer's build effect resolves endpoint middleware (including
// SchemaErrorMiddleware, applied API-wide in index.ts) from its own context
// at build time, so SchemaErrorMiddlewareLive must be provided to each group
// individually — merging it alongside them wouldn't cross-satisfy anything.
const HandlersLive = Layer.mergeAll(
  SearchGroupLive,
  LatestGroupLive,
  DownloadGroupLive,
  AllDebridGroupLive,
  AnnasArchiveGroupLive,
  JobsGroupLive,
  SettingsGroupLive,
  ConvertGroupLive,
  KomgaGroupLive,
  CopypartyGroupLive,
  WatchesGroupLive,
  PushGroupLive,
).pipe(Layer.provide(SchemaErrorMiddlewareLive))

const CorsLive = HttpRouter.cors({
  allowedOrigins: ["*"],
  allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
})

const ApiLive = HttpApiBuilder.layer(InkpipeApi, { openapiPath: "/openapi.json" }).pipe(Layer.provide(HandlersLive))

const SwaggerLive = HttpApiSwagger.layer(InkpipeApi, { path: "/docs" })

// Order matters for readability only — the underlying router (find-my-way)
// resolves static/param routes ahead of the catch-all wildcard regardless of
// registration order, so the typed API and the /api/jobs/ws route always
// take priority over the static/SPA fallback.
const HttpAppLayer = Layer.mergeAll(
  ApiLive,
  SwaggerLive,
  JobsWsRouteLive,
  StaticFallbackRouteLive,
  CorsLive,
)

// `HttpRouter.serve` builds the shared router from `HttpAppLayer`, and turns
// it into a `Layer` that needs only `HttpServer.HttpServer` (provided by
// BunHttpServer in main.ts) plus this app's own service dependencies
// (provided by MainLayer).
export const HttpServerLive = HttpRouter.serve(HttpAppLayer)
