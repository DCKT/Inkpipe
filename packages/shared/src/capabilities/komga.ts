import { defineContract } from "@inkpipe/capability/contract"
import { Schema } from "effect"
import { KomgaBookSchema, KomgaLibrarySchema, KomgaSeriesSchema } from "../schemas"
import { KomgaHttpErrorS, KomgaNotConfiguredS } from "../httpApi/errors"

const Failure = Schema.Union([KomgaNotConfiguredS, KomgaHttpErrorS])

export const KomgaThumbnailResponseSchema = Schema.Struct({ thumbnail: Schema.String })

export const listKomgaLibrariesContract = defineContract("listKomgaLibraries", {
  description: "List the Komga libraries",
  annotations: { readOnly: true, idempotent: true, openWorld: true },
  http: { method: "GET", path: "/api/komga/libraries" },
  input: Schema.Struct({}),
  output: Schema.Array(KomgaLibrarySchema),
  failure: Failure,
})

export const listKomgaSeriesContract = defineContract("listKomgaSeries", {
  description: "List the series in one Komga library, or in every library",
  annotations: { readOnly: true, idempotent: true, openWorld: true },
  http: { method: "POST", path: "/api/komga/series" },
  input: Schema.Struct({ libraryId: Schema.optional(Schema.String) }),
  output: Schema.Array(KomgaSeriesSchema),
  failure: Failure,
})

export const getKomgaThumbnailContract = defineContract("getKomgaThumbnail", {
  description: "Fetch a series thumbnail as a data string",
  annotations: { readOnly: true, idempotent: true, openWorld: true },
  http: { method: "GET", path: "/api/komga/thumbnail" },
  input: Schema.Struct({ seriesId: Schema.String }),
  output: KomgaThumbnailResponseSchema,
  failure: Failure,
})

export const listKomgaBooksContract = defineContract("listKomgaBooks", {
  description: "List the books in one Komga series",
  annotations: { readOnly: true, idempotent: true, openWorld: true },
  http: { method: "POST", path: "/api/komga/books" },
  input: Schema.Struct({ seriesId: Schema.String }),
  output: Schema.Array(KomgaBookSchema),
  failure: Failure,
})

export const komgaContracts = [
  listKomgaLibrariesContract,
  listKomgaSeriesContract,
  getKomgaThumbnailContract,
  listKomgaBooksContract,
] as const
