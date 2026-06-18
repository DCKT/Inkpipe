import { Schema } from "effect"

export class ConfigLoadError extends Schema.TaggedError<ConfigLoadError>()(
  "ConfigLoadError",
  { message: Schema.String },
) {}

export class ConfigSaveError extends Schema.TaggedError<ConfigSaveError>()(
  "ConfigSaveError",
  { message: Schema.String },
) {}

export class ProwlarrNotConfigured extends Schema.TaggedError<ProwlarrNotConfigured>()(
  "ProwlarrNotConfigured",
  { message: Schema.String },
) {}

export class ProwlarrHttpError extends Schema.TaggedError<ProwlarrHttpError>()(
  "ProwlarrHttpError",
  { message: Schema.String, status: Schema.optional(Schema.Number) },
) {}

export class AllDebridNotConfigured extends Schema.TaggedError<AllDebridNotConfigured>()(
  "AllDebridNotConfigured",
  { message: Schema.String },
) {}

export class AllDebridHttpError extends Schema.TaggedError<AllDebridHttpError>()(
  "AllDebridHttpError",
  { message: Schema.String, status: Schema.optional(Schema.Number) },
) {}

export class MagnetUploadError extends Schema.TaggedError<MagnetUploadError>()(
  "MagnetUploadError",
  { message: Schema.String },
) {}

export class MagnetStatusError extends Schema.TaggedError<MagnetStatusError>()(
  "MagnetStatusError",
  { message: Schema.String, statusCode: Schema.optional(Schema.Number) },
) {}

export class KomgaNotConfigured extends Schema.TaggedError<KomgaNotConfigured>()(
  "KomgaNotConfigured",
  { message: Schema.String },
) {}

export class KomgaHttpError extends Schema.TaggedError<KomgaHttpError>()(
  "KomgaHttpError",
  { message: Schema.String, status: Schema.optional(Schema.Number) },
) {}

export class CopypartyNotConfigured extends Schema.TaggedError<CopypartyNotConfigured>()(
  "CopypartyNotConfigured",
  { message: Schema.String },
) {}

export class CopypartyHttpError extends Schema.TaggedError<CopypartyHttpError>()(
  "CopypartyHttpError",
  { message: Schema.String },
) {}

export class CopypartyFolderError extends Schema.TaggedError<CopypartyFolderError>()(
  "CopypartyFolderError",
  { message: Schema.String },
) {}

export class KccError extends Schema.TaggedError<KccError>()(
  "KccError",
  { message: Schema.String },
) {}

export class FileManagerError extends Schema.TaggedError<FileManagerError>()(
  "FileManagerError",
  { message: Schema.String },
) {}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  { message: Schema.String },
) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  { message: Schema.String },
) {}

export class PipelineError extends Schema.TaggedError<PipelineError>()(
  "PipelineError",
  { message: Schema.String },
) {}

export class NoMagnetUrl extends Schema.TaggedError<NoMagnetUrl>()(
  "NoMagnetUrl",
  { message: Schema.String },
) {}

export class DebridTimeoutError extends Schema.TaggedError<DebridTimeoutError>()(
  "DebridTimeoutError",
  { message: Schema.String },
) {}

export class DebridError extends Schema.TaggedError<DebridError>()(
  "DebridError",
  { message: Schema.String },
) {}

export class NoFilesError extends Schema.TaggedError<NoFilesError>()(
  "NoFilesError",
  { message: Schema.String },
) {}

export class KccConversionError extends Schema.TaggedError<KccConversionError>()(
  "KccConversionError",
  { message: Schema.String },
) {}

export class WatchNotFoundError extends Schema.TaggedError<WatchNotFoundError>()(
  "WatchNotFoundError",
  { message: Schema.String },
) {}

export class WatchStoreError extends Schema.TaggedError<WatchStoreError>()(
  "WatchStoreError",
  { message: Schema.String },
) {}
