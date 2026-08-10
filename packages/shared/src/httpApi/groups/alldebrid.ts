import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { UploadResultSchema } from "../../schemas"
import { NoMagnetUrlS, AllDebridNotConfiguredS, MagnetUploadErrorS, AllDebridHttpErrorS } from "../errors"

export const SaveMagnetRequestSchema = Schema.Struct({
  magnetUrl: Schema.optional(Schema.NullOr(Schema.String)),
  downloadUrl: Schema.optional(Schema.NullOr(Schema.String)),
})
export type SaveMagnetRequest = typeof SaveMagnetRequestSchema.Type

export const AllDebridGroup = HttpApiGroup.make("alldebrid").add(
  HttpApiEndpoint.post("saveMagnet", "/api/alldebrid/save-magnet", {
    payload: SaveMagnetRequestSchema,
    success: UploadResultSchema,
    error: [NoMagnetUrlS, AllDebridNotConfiguredS, MagnetUploadErrorS, AllDebridHttpErrorS],
  }),
)
