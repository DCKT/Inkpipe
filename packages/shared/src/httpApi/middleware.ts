// Transforms HttpApi's built-in request-decoding failures (missing/invalid
// path params, query params, headers, or payload) from an empty 400 response
// into a JSON body with a real message, matching the shape every other typed
// error in this API returns (see errors.ts).
import { Effect } from "effect"
import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { RequestValidationError } from "../errors"
import { RequestValidationErrorS } from "./errors"

export class SchemaErrorMiddleware extends HttpApiMiddleware.Service<SchemaErrorMiddleware>()(
  "api/SchemaErrorMiddleware",
  { error: RequestValidationErrorS },
) {}

function formatCause(cause: unknown): string {
  if (cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string") {
    return cause.message
  }
  return String(cause)
}

export const SchemaErrorMiddlewareLive = HttpApiMiddleware.layerSchemaErrorTransform(
  SchemaErrorMiddleware,
  (schemaError) =>
    Effect.fail(
      new RequestValidationError({
        message: `Invalid request ${schemaError.kind.toLowerCase()}: ${formatCause(schemaError.cause)}`,
      }),
    ),
)
