import { Cause, Effect, Exit, Layer } from "effect";
import { HttpApiClient } from "effect/unstable/httpapi";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";
import { InkpipeApi } from "@inkpipe/shared";

// The client's outgoing requests otherwise carry a `b3` trace-propagation
// header by default; the server's CORS config doesn't allow it (and there's
// no distributed tracing collector for a same-app SPA to propagate to), so
// preflight requests fail with a CORS error before the request is ever sent.
const NoTracePropagation = Layer.succeed(HttpClient.TracerPropagationEnabled, false);

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

export const WS_BASE = import.meta.env.DEV
  ? "ws://localhost:3000"
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;

export type ApiClient = HttpApiClient.ForApi<typeof InkpipeApi>;

let clientPromise: Promise<ApiClient> | undefined;

function getClient(): Promise<ApiClient> {
  if (!clientPromise) {
    clientPromise = Effect.runPromise(
      HttpApiClient.make(InkpipeApi, { baseUrl: API_BASE }).pipe(
        Effect.provide(Layer.merge(FetchHttpClient.layer, NoTracePropagation)),
      ),
    );
  }
  return clientPromise;
}

// Every tagged error in @inkpipe/shared's errors.ts (decoded by the client
// from the server's JSON error body) and Effect's own HttpClientError /
// SchemaError all carry a `message` string, same as the ky HTTPError this
// replaces — react-query's onError / err.message call sites keep working.
function toError(cause: Cause.Cause<unknown>): Error {
  const squashed = Cause.squash(cause);
  if (squashed instanceof Error) return squashed;
  if (squashed && typeof squashed === "object" && "message" in squashed && typeof squashed.message === "string") {
    return new Error(squashed.message);
  }
  return new Error(String(squashed));
}

export async function runApi<A, E>(
  fn: (client: ApiClient) => Effect.Effect<A, E, never>,
): Promise<A> {
  const client = await getClient();
  // TracerPropagationEnabled is a Context.Reference, resolved per-run from
  // the executing fiber rather than baked into the client at construction
  // time (unlike HttpClient itself) — it must be provided again here, around
  // each actual call, or every request goes back to sending b3/traceparent.
  const exit = await Effect.runPromiseExit(fn(client).pipe(Effect.provide(NoTracePropagation)));
  if (Exit.isSuccess(exit)) return exit.value;
  throw toError(exit.cause);
}
