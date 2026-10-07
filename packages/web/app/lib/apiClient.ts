import { Cause, Effect, Exit, Layer } from "effect"
import { FetchHttpClient, HttpClient } from "effect/http"
import { toHttpClient } from "@inkpipe/capability/to-http-client"
import { allContracts } from "@inkpipe/shared"

// The client's outgoing requests otherwise carry a `b3` trace-propagation
// header by default; the server's CORS config doesn't allow it (and there's
// no distributed tracing collector for a same-app SPA to propagate to), so
// preflight requests fail with a CORS error before the request is ever sent.
const NoTracePropagation = Layer.succeed(HttpClient.TracerPropagationEnabled, false)

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : ""

export const WS_BASE = import.meta.env.DEV
  ? "ws://localhost:3000"
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`

// Every tagged error in @inkpipe/shared's errors.ts (decoded by the client
// from the server's JSON error body) and Effect's own HttpClientError /
// SchemaError all carry a `message` string, same as the ky HTTPError this
// replaces — react-query's onError / err.message call sites keep working.
function toError(cause: Cause.Cause<unknown>): Error {
  const squashed = Cause.squash(cause)
  if (squashed instanceof Error) return squashed
  if (
    squashed &&
    typeof squashed === "object" &&
    "message" in squashed &&
    typeof squashed.message === "string"
  ) {
    return new Error(squashed.message)
  }
  return new Error(String(squashed))
}

// Capability contracts are the source of truth for migrated routes: the browser reads contracts
// (names, routes, schemas) and never the server handlers.
const capabilityClient = toHttpClient(allContracts, { baseUrl: API_BASE })

export type CapabilityClient = typeof capabilityClient

export async function runCapability<A, E>(
  fn: (client: CapabilityClient) => Effect.Effect<A, E, HttpClient.HttpClient>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    fn(capabilityClient).pipe(
      Effect.provide(Layer.merge(FetchHttpClient.layer, NoTracePropagation)),
    ),
  )
  if (Exit.isSuccess(exit)) return exit.value
  throw toError(exit.cause)
}

// Convert stays outside the contract registry: it is a multipart upload.
export async function startConvert(formData: FormData): Promise<{ id: string }> {
  const response = await fetch(`${API_BASE}/api/convert/start`, { method: "POST", body: formData })
  const body: unknown = await response.json().catch(() => undefined)
  if (response.ok && typeof body === "object" && body !== null && "id" in body) {
    return { id: String(body.id) }
  }
  const message =
    typeof body === "object" && body !== null && "message" in body
      ? String(body.message)
      : `Conversion failed to start (${response.status})`
  throw new Error(message)
}
