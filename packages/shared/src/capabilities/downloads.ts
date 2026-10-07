import { defineContract } from "@inkpipe/capability/contract"
import { Schema } from "effect"
import { DownloadRequestSchema, DownloadResponseSchema } from "../api"
import { UploadResultSchema } from "../schemas"
import {
  AllDebridHttpErrorS,
  AllDebridNotConfiguredS,
  CopypartyFolderErrorS,
  CopypartyHttpErrorS,
  CopypartyNotConfiguredS,
  MagnetUploadErrorS,
  NoMagnetUrlS,
} from "../httpApi/errors"

export const SaveMagnetRequestSchema = Schema.Struct({
  magnetUrl: Schema.optional(Schema.NullOr(Schema.String)),
  downloadUrl: Schema.optional(Schema.NullOr(Schema.String)),
})
export type SaveMagnetRequest = typeof SaveMagnetRequestSchema.Type

export const downloadContract = defineContract("download", {
  description: "Start the debrid, convert and upload pipeline for each selected release",
  annotations: { openWorld: true },
  http: { method: "POST", path: "/api/download" },
  input: DownloadRequestSchema,
  output: DownloadResponseSchema,
  failure: Schema.Union([CopypartyNotConfiguredS, CopypartyHttpErrorS, CopypartyFolderErrorS]),
})

export const saveMagnetContract = defineContract("saveMagnet", {
  description: "Send a magnet or download link to AllDebrid without running the pipeline",
  annotations: { openWorld: true },
  http: { method: "POST", path: "/api/alldebrid/save-magnet" },
  input: SaveMagnetRequestSchema,
  output: UploadResultSchema,
  failure: Schema.Union([
    NoMagnetUrlS,
    AllDebridNotConfiguredS,
    MagnetUploadErrorS,
    AllDebridHttpErrorS,
  ]),
})

export const downloadContracts = [downloadContract, saveMagnetContract] as const
