import { Context, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { InkpipeApi } from "@inkpipe/shared"

// --- Base URLs ---------------------------------------------------------

export interface ApiBases {
  readonly http: string
  readonly ws: string
}

/**
 * In dev the Vite server (5173) proxies nothing, so the SPA talks to the Bun
 * server on :3000 directly. In production the SPA is served by that same
 * server, so everything is same-origin.
 */
export const resolveBases = (
  isDev: boolean,
  location: { readonly protocol: string; readonly host: string },
): ApiBases =>
  isDev
    ? { http: "http://localhost:3000", ws: "ws://localhost:3000" }
    : {
        http: "",
        ws: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`,
      }

export const bases: ApiBases = resolveBases(import.meta.env.DEV, window.location)

// --- Errors ------------------------------------------------------------

/** The single failure shape Commands deal with, whatever went wrong. */
export class ApiFailure extends Schema.TaggedError<ApiFailure>()("ApiFailure", {
  message: Schema.String,
}) {}

const HasMessage = Schema.Struct({ message: Schema.String })
const hasMessage = Schema.is(HasMessage)

/**
 * Every tagged error in @inkpipe/shared (decoded by the client from the
 * server's JSON body), HttpClientError and SchemaError all carry `message`.
 */
export const describeError = (error: unknown): string =>
  hasMessage(error) && error.message !== "" ? error.message : "Something went wrong"

// --- Client service ----------------------------------------------------

export type ApiClient = HttpApiClient.ForApi<typeof InkpipeApi>

export class ApiClientService extends Context.Service<ApiClientService, ApiClient>()(
  "ApiClientService",
) {
  /** Needs an `HttpClient` — tests provide a stub, the app provides fetch. */
  static readonly layer = (baseUrl: string) =>
    Layer.effect(this, HttpApiClient.make(InkpipeApi, { baseUrl }))

  static readonly Default = this.layer(bases.http).pipe(Layer.provide(FetchHttpClient.layer))
}

/**
 * Run a call against the typed client, folding every failure (typed API
 * error, transport error, decode error) into `ApiFailure`.
 *
 * Trace propagation is switched off per-run: the default `b3` header isn't
 * allowed by the server's CORS config, so preflights would fail before the
 * request is ever sent. It's a Context.Reference resolved from the running
 * fiber, so it must wrap each call rather than the client construction.
 *
 * Only *failures* are mapped. A defect (a bug, a throwing client) is left as
 * a defect so it surfaces in Foldkit's crash view instead of being shown to
 * the user as an ordinary request error.
 */
export const callApi = <A, E>(
  fn: (client: ApiClient) => Effect.Effect<A, E, never>,
): Effect.Effect<A, ApiFailure, ApiClientService> =>
  Effect.gen(function* () {
    const client = yield* ApiClientService
    return yield* fn(client).pipe(
      Effect.provideService(HttpClient.TracerPropagationEnabled, false),
      Effect.mapError((error) => new ApiFailure({ message: describeError(error) })),
    )
  })
