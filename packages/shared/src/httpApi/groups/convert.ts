import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { Multipart } from "effect/unstable/http"
import { ConvertErrorS, NotFoundErrorS } from "../errors"

export const ConvertStartPayloadSchema = Schema.Struct({
  file: Multipart.SingleFileSchema,
  options: Schema.optional(Schema.String),
}).pipe(HttpApiSchema.asMultipart())

export const ConvertStartResponseSchema = Schema.Struct({ id: Schema.String })

export const ConvertGroup = HttpApiGroup.make("convert").add(
  HttpApiEndpoint.post("start", "/api/convert/start", {
    payload: ConvertStartPayloadSchema,
    success: ConvertStartResponseSchema,
    error: [ConvertErrorS],
  }),
).add(
  // Returns a raw text/event-stream response built in the handler (SSE);
  // the declared success schema documents the byte-stream nature for OpenAPI.
  HttpApiEndpoint.get("progress", "/api/convert/progress", {
    query: { id: Schema.String },
    success: HttpApiSchema.StreamUint8Array({ contentType: "text/event-stream" }),
  }),
).add(
  // Returns a raw EPUB byte response built in the handler.
  HttpApiEndpoint.get("download", "/api/convert/download", {
    query: { id: Schema.String },
    success: HttpApiSchema.StreamUint8Array({ contentType: "application/epub+zip" }),
    error: [ConvertErrorS, NotFoundErrorS],
  }),
)
