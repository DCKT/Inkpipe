import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { ProwlarrResultSchema } from "../../schemas"
import { ProwlarrNotConfiguredS, ProwlarrHttpErrorS } from "../errors"

export const LatestGroup = HttpApiGroup.make("latest").add(
  HttpApiEndpoint.get("latest", "/api/latest", {
    success: Schema.Array(ProwlarrResultSchema),
    error: [ProwlarrNotConfiguredS, ProwlarrHttpErrorS],
  }),
)
