import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { JobsResponseSchema, ClearJobsResponseSchema } from "../../api"

export const JobsGroup = HttpApiGroup.make("jobs").add(
  HttpApiEndpoint.get("list", "/api/jobs", {
    success: JobsResponseSchema,
  }),
).add(
  HttpApiEndpoint.delete("clear", "/api/jobs", {
    success: ClearJobsResponseSchema,
  }),
)
