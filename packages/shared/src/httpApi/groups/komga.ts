import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { KomgaLibrarySchema, KomgaSeriesSchema, KomgaBookSchema } from "../../schemas"
import { KomgaNotConfiguredS, KomgaHttpErrorS } from "../errors"

const KomgaErrors = [KomgaNotConfiguredS, KomgaHttpErrorS] as const

export const KomgaSeriesRequestSchema = Schema.Struct({
  libraryId: Schema.optional(Schema.String),
})

export const KomgaBooksRequestSchema = Schema.Struct({
  seriesId: Schema.String,
})

export const KomgaThumbnailResponseSchema = Schema.Struct({ thumbnail: Schema.String })

export const KomgaGroup = HttpApiGroup.make("komga").add(
  HttpApiEndpoint.get("libraries", "/api/komga/libraries", {
    success: Schema.Array(KomgaLibrarySchema),
    error: KomgaErrors,
  }),
).add(
  HttpApiEndpoint.post("series", "/api/komga/series", {
    payload: KomgaSeriesRequestSchema,
    success: Schema.Array(KomgaSeriesSchema),
    error: KomgaErrors,
  }),
).add(
  HttpApiEndpoint.get("thumbnail", "/api/komga/thumbnail", {
    query: { seriesId: Schema.String },
    success: KomgaThumbnailResponseSchema,
    error: KomgaErrors,
  }),
).add(
  HttpApiEndpoint.post("books", "/api/komga/books", {
    payload: KomgaBooksRequestSchema,
    success: Schema.Array(KomgaBookSchema),
    error: KomgaErrors,
  }),
)
