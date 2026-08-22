import { Schema } from "effect"

export class ConfigLoadError extends Schema.TaggedErrorClass<ConfigLoadError>()(
  "ConfigLoadError",
  { message: Schema.String },
) {}

export class ConfigSaveError extends Schema.TaggedErrorClass<ConfigSaveError>()(
  "ConfigSaveError",
  { message: Schema.String },
) {}

export class ProwlarrNotConfigured extends Schema.TaggedErrorClass<ProwlarrNotConfigured>()(
  "ProwlarrNotConfigured",
  { message: Schema.String },
) {}

export class ProwlarrHttpError extends Schema.TaggedErrorClass<ProwlarrHttpError>()(
  "ProwlarrHttpError",
  { message: Schema.String, status: Schema.optional(Schema.Finite) },
) {}

export class AllDebridNotConfigured extends Schema.TaggedErrorClass<AllDebridNotConfigured>()(
  "AllDebridNotConfigured",
  { message: Schema.String },
) {}

export class AllDebridHttpError extends Schema.TaggedErrorClass<AllDebridHttpError>()(
  "AllDebridHttpError",
  { message: Schema.String, status: Schema.optional(Schema.Finite) },
) {}

export class MagnetUploadError extends Schema.TaggedErrorClass<MagnetUploadError>()(
  "MagnetUploadError",
  { message: Schema.String },
) {}

export class MagnetStatusError extends Schema.TaggedErrorClass<MagnetStatusError>()(
  "MagnetStatusError",
  { message: Schema.String, statusCode: Schema.optional(Schema.Finite) },
) {}

export class AnnasArchiveNotConfigured extends Schema.TaggedErrorClass<AnnasArchiveNotConfigured>()(
  "AnnasArchiveNotConfigured",
  { message: Schema.String },
) {}

export class AnnasArchiveHttpError extends Schema.TaggedErrorClass<AnnasArchiveHttpError>()(
  "AnnasArchiveHttpError",
  { message: Schema.String, status: Schema.optional(Schema.Finite) },
) {}

export class AnnasArchiveDownloadError extends Schema.TaggedErrorClass<AnnasArchiveDownloadError>()(
  "AnnasArchiveDownloadError",
  { message: Schema.String },
) {}

export class KomgaNotConfigured extends Schema.TaggedErrorClass<KomgaNotConfigured>()(
  "KomgaNotConfigured",
  { message: Schema.String },
) {}

export class KomgaHttpError extends Schema.TaggedErrorClass<KomgaHttpError>()(
  "KomgaHttpError",
  { message: Schema.String, status: Schema.optional(Schema.Finite) },
) {}

export class TelegramNotConfigured extends Schema.TaggedErrorClass<TelegramNotConfigured>()(
  "TelegramNotConfigured",
  { message: Schema.String },
) {}

export class TelegramHttpError extends Schema.TaggedErrorClass<TelegramHttpError>()(
  "TelegramHttpError",
  { message: Schema.String, status: Schema.optional(Schema.Finite) },
) {}

export class CopypartyNotConfigured extends Schema.TaggedErrorClass<CopypartyNotConfigured>()(
  "CopypartyNotConfigured",
  { message: Schema.String },
) {}

export class CopypartyHttpError extends Schema.TaggedErrorClass<CopypartyHttpError>()(
  "CopypartyHttpError",
  { message: Schema.String },
) {}

export class CopypartyFolderError extends Schema.TaggedErrorClass<CopypartyFolderError>()(
  "CopypartyFolderError",
  { message: Schema.String },
) {}

export class KccError extends Schema.TaggedErrorClass<KccError>()(
  "KccError",
  { message: Schema.String },
) {}

export class FileManagerError extends Schema.TaggedErrorClass<FileManagerError>()(
  "FileManagerError",
  { message: Schema.String },
) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
  "NotFoundError",
  { message: Schema.String },
) {}

export class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
  "ValidationError",
  { message: Schema.String },
) {}

export class PipelineError extends Schema.TaggedErrorClass<PipelineError>()(
  "PipelineError",
  { message: Schema.String },
) {}

export class NoMagnetUrl extends Schema.TaggedErrorClass<NoMagnetUrl>()(
  "NoMagnetUrl",
  { message: Schema.String },
) {}

export class DebridTimeoutError extends Schema.TaggedErrorClass<DebridTimeoutError>()(
  "DebridTimeoutError",
  { message: Schema.String },
) {}

export class DebridError extends Schema.TaggedErrorClass<DebridError>()(
  "DebridError",
  { message: Schema.String },
) {}

export class NoFilesError extends Schema.TaggedErrorClass<NoFilesError>()(
  "NoFilesError",
  { message: Schema.String },
) {}

export class KccConversionError extends Schema.TaggedErrorClass<KccConversionError>()(
  "KccConversionError",
  { message: Schema.String },
) {}

export class WatchNotFoundError extends Schema.TaggedErrorClass<WatchNotFoundError>()(
  "WatchNotFoundError",
  { message: Schema.String },
) {}

export class WatchStoreError extends Schema.TaggedErrorClass<WatchStoreError>()(
  "WatchStoreError",
  { message: Schema.String },
) {}

export class ConvertError extends Schema.TaggedErrorClass<ConvertError>()(
  "ConvertError",
  { message: Schema.String },
) {}

export class SettingsImportError extends Schema.TaggedErrorClass<SettingsImportError>()(
  "SettingsImportError",
  { message: Schema.String },
) {}

// Raised when a request fails HttpApi's schema decoding (bad/missing params,
// query, headers, or payload) — distinct from ValidationError, which is for
// well-formed requests that fail a business rule.
export class RequestValidationError extends Schema.TaggedErrorClass<RequestValidationError>()(
  "RequestValidationError",
  { message: Schema.String },
) {}
