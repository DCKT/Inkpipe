// Wraps each shared `Schema.TaggedErrorClass` with an HTTP status annotation
// (`HttpApiSchema.status`) so HttpApi can encode the right status code for
// each typed error without per-route Effect.catch boilerplate.
import { HttpApiSchema } from "effect/unstable/httpapi"
import {
  ConfigLoadError,
  ConfigSaveError,
  ProwlarrNotConfigured,
  ProwlarrHttpError,
  AllDebridNotConfigured,
  AllDebridHttpError,
  MagnetUploadError,
  MagnetStatusError,
  AnnasArchiveNotConfigured,
  AnnasArchiveHttpError,
  AnnasArchiveDownloadError,
  KomgaNotConfigured,
  KomgaHttpError,
  TelegramNotConfigured,
  TelegramHttpError,
  CopypartyNotConfigured,
  CopypartyHttpError,
  CopypartyFolderError,
  KccError,
  FileManagerError,
  NotFoundError,
  ValidationError,
  PipelineError,
  NoMagnetUrl,
  DebridTimeoutError,
  DebridError,
  NoFilesError,
  KccConversionError,
  WatchNotFoundError,
  WatchStoreError,
  ConvertError,
  SettingsImportError,
  RequestValidationError,
} from "../errors"

export const ConfigLoadErrorS = ConfigLoadError.pipe(HttpApiSchema.status(500))
export const ConfigSaveErrorS = ConfigSaveError.pipe(HttpApiSchema.status(500))

export const ProwlarrNotConfiguredS = ProwlarrNotConfigured.pipe(HttpApiSchema.status(503))
export const ProwlarrHttpErrorS = ProwlarrHttpError.pipe(HttpApiSchema.status(502))

export const AllDebridNotConfiguredS = AllDebridNotConfigured.pipe(HttpApiSchema.status(503))
export const AllDebridHttpErrorS = AllDebridHttpError.pipe(HttpApiSchema.status(502))

export const MagnetUploadErrorS = MagnetUploadError.pipe(HttpApiSchema.status(502))
export const MagnetStatusErrorS = MagnetStatusError.pipe(HttpApiSchema.status(502))

export const AnnasArchiveNotConfiguredS = AnnasArchiveNotConfigured.pipe(HttpApiSchema.status(503))
export const AnnasArchiveHttpErrorS = AnnasArchiveHttpError.pipe(HttpApiSchema.status(502))
export const AnnasArchiveDownloadErrorS = AnnasArchiveDownloadError.pipe(HttpApiSchema.status(502))

export const KomgaNotConfiguredS = KomgaNotConfigured.pipe(HttpApiSchema.status(503))
export const KomgaHttpErrorS = KomgaHttpError.pipe(HttpApiSchema.status(502))

export const TelegramNotConfiguredS = TelegramNotConfigured.pipe(HttpApiSchema.status(503))
export const TelegramHttpErrorS = TelegramHttpError.pipe(HttpApiSchema.status(502))

export const CopypartyNotConfiguredS = CopypartyNotConfigured.pipe(HttpApiSchema.status(503))
export const CopypartyHttpErrorS = CopypartyHttpError.pipe(HttpApiSchema.status(502))
export const CopypartyFolderErrorS = CopypartyFolderError.pipe(HttpApiSchema.status(502))

export const KccErrorS = KccError.pipe(HttpApiSchema.status(500))
export const FileManagerErrorS = FileManagerError.pipe(HttpApiSchema.status(500))

export const NotFoundErrorS = NotFoundError.pipe(HttpApiSchema.status(404))
export const ValidationErrorS = ValidationError.pipe(HttpApiSchema.status(422))
export const PipelineErrorS = PipelineError.pipe(HttpApiSchema.status(500))

export const NoMagnetUrlS = NoMagnetUrl.pipe(HttpApiSchema.status(422))
export const DebridTimeoutErrorS = DebridTimeoutError.pipe(HttpApiSchema.status(502))
export const DebridErrorS = DebridError.pipe(HttpApiSchema.status(502))
export const NoFilesErrorS = NoFilesError.pipe(HttpApiSchema.status(422))
export const KccConversionErrorS = KccConversionError.pipe(HttpApiSchema.status(500))

export const WatchNotFoundErrorS = WatchNotFoundError.pipe(HttpApiSchema.status(404))
export const WatchStoreErrorS = WatchStoreError.pipe(HttpApiSchema.status(500))

export const ConvertErrorS = ConvertError.pipe(HttpApiSchema.status(400))
export const SettingsImportErrorS = SettingsImportError.pipe(HttpApiSchema.status(422))

export const RequestValidationErrorS = RequestValidationError.pipe(HttpApiSchema.status(400))
