// Test helper: serves the real capability HTTP projection (real contracts, real handlers) as an
// in-process web handler, backed by whichever service layers a test provides.
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { HttpRouter } from "effect/http"
import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import { CapabilityHttp } from "./capabilityApi"

export type WebHandler = (request: Request) => Promise<Response>

export const makeCapabilityHandler = (
  // oxlint-disable-next-line typescript/no-explicit-any -- tests provide only the services a route touches, so the layer's requirement type never collapses to `never`.
  services: Layer.Layer<any>,
  options?: { readonly cors?: boolean },
): WebHandler => {
  const ApiLive = HttpApiBuilder.layer(CapabilityHttp.api).pipe(
    Layer.provide(CapabilityHttp.layer),
    Layer.provide(services),
  )
  const app = options?.cors
    ? Layer.mergeAll(
        ApiLive,
        HttpRouter.cors({
          allowedOrigins: ["*"],
          allowedMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
          allowedHeaders: ["Content-Type"],
        }),
      )
    : ApiLive
  const provided = app.pipe(Layer.provide(BunHttpServer.layerHttpServices))
  // oxlint-disable-next-line typescript/no-explicit-any -- same partial-services reason as above.
  const { handler } = HttpRouter.toWebHandler(provided as any)
  return handler as WebHandler
}
