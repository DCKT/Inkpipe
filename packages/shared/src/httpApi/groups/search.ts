import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ProwlarrResultSchema } from "../../schemas"
import { ProwlarrNotConfiguredS, ProwlarrHttpErrorS } from "../errors"

export const SearchGroup = HttpApiGroup.make("search").add(
  HttpApiEndpoint.get("search", "/api/search", {
    query: { q: Schema.optional(Schema.String) },
    success: Schema.Array(ProwlarrResultSchema),
    error: [ProwlarrNotConfiguredS, ProwlarrHttpErrorS],
  }),
)
