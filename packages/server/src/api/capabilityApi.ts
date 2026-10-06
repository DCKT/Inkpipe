// HTTP projection of the capability registry. Each capability is one contract plus one handler;
// the routes, schemas and OpenAPI document are derived, not written by hand.
import { toHttpApi } from "@inkpipe/capability/to-http-api"
import { RequestValidationError } from "@inkpipe/shared"
import { Effect, Schema } from "effect"
import { HttpServerResponse } from "effect/http"
import { capabilities } from "../capabilities"

const detailOf = (cause: unknown): string =>
  typeof cause === "object" &&
  cause !== null &&
  "message" in cause &&
  typeof cause.message === "string"
    ? cause.message
    : String(cause)

// Same JSON shape the hand-written API's SchemaErrorMiddleware returns for bad requests.
export const CapabilityHttp = toHttpApi("InkpipeCapabilities", capabilities, {
  decodeRefusal: (refusal) =>
    Schema.encodeEffect(RequestValidationError)(
      new RequestValidationError({
        message: `Invalid request ${refusal.kind.toLowerCase()}: ${detailOf(refusal.cause)}`,
      }),
    ).pipe(
      Effect.flatMap((body) => HttpServerResponse.json(body, { status: 400 })),
      Effect.orDie,
    ),
})
