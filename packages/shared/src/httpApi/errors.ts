// Wraps each shared `Schema.TaggedError` with an HTTP status annotation
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

export const ConfigLoadErrorS = HttpApiSchema.status(500)(ConfigLoadError)
export const ConfigSaveErrorS = HttpApiSchema.status(500)(ConfigSaveError)

export const ProwlarrNotConfiguredS = HttpApiSchema.status(503)(ProwlarrNotConfigured)
export const ProwlarrHttpErrorS = HttpApiSchema.status(502)(ProwlarrHttpError)

export const AllDebridNotConfiguredS = HttpApiSchema.status(503)(AllDebridNotConfigured)
export const AllDebridHttpErrorS = HttpApiSchema.status(502)(AllDebridHttpError)

export const MagnetUploadErrorS = HttpApiSchema.status(502)(MagnetUploadError)
export const MagnetStatusErrorS = HttpApiSchema.status(502)(MagnetStatusError)

export const AnnasArchiveNotConfiguredS = HttpApiSchema.status(503)(AnnasArchiveNotConfigured)
export const AnnasArchiveHttpErrorS = HttpApiSchema.status(502)(AnnasArchiveHttpError)
export const AnnasArchiveDownloadErrorS = HttpApiSchema.status(502)(AnnasArchiveDownloadError)

export const KomgaNotConfiguredS = HttpApiSchema.status(503)(KomgaNotConfigured)
export const KomgaHttpErrorS = HttpApiSchema.status(502)(KomgaHttpError)

export const TelegramNotConfiguredS = HttpApiSchema.status(503)(TelegramNotConfigured)
export const TelegramHttpErrorS = HttpApiSchema.status(502)(TelegramHttpError)

export const CopypartyNotConfiguredS = HttpApiSchema.status(503)(CopypartyNotConfigured)
export const CopypartyHttpErrorS = HttpApiSchema.status(502)(CopypartyHttpError)
export const CopypartyFolderErrorS = HttpApiSchema.status(502)(CopypartyFolderError)

export const KccErrorS = HttpApiSchema.status(500)(KccError)
export const FileManagerErrorS = HttpApiSchema.status(500)(FileManagerError)

export const NotFoundErrorS = HttpApiSchema.status(404)(NotFoundError)
export const ValidationErrorS = HttpApiSchema.status(422)(ValidationError)
export const PipelineErrorS = HttpApiSchema.status(500)(PipelineError)

export const NoMagnetUrlS = HttpApiSchema.status(422)(NoMagnetUrl)
export const DebridTimeoutErrorS = HttpApiSchema.status(502)(DebridTimeoutError)
export const DebridErrorS = HttpApiSchema.status(502)(DebridError)
export const NoFilesErrorS = HttpApiSchema.status(422)(NoFilesError)
export const KccConversionErrorS = HttpApiSchema.status(500)(KccConversionError)

export const WatchNotFoundErrorS = HttpApiSchema.status(404)(WatchNotFoundError)
export const WatchStoreErrorS = HttpApiSchema.status(500)(WatchStoreError)

export const ConvertErrorS = HttpApiSchema.status(400)(ConvertError)
export const SettingsImportErrorS = HttpApiSchema.status(422)(SettingsImportError)

export const RequestValidationErrorS = HttpApiSchema.status(400)(RequestValidationError)
