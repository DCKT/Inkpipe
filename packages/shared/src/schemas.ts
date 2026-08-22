import { Effect, Schema } from "effect"

// --- Primitives ---

export const JobStageSchema = Schema.Literals([
  "UPLOADING",
  "DEBRID_PROCESSING",
  "DOWNLOADING",
  "CONVERTING",
  "UPLOADING_COPYPARTY",
  "DONE",
  "FAILED",
])
export type JobStage = typeof JobStageSchema.Type

// --- Branded IDs ---

export const WatchId = Schema.Int.pipe(Schema.brand("WatchId"))
export type WatchId = typeof WatchId.Type

export const WatchAlertId = Schema.Int.pipe(Schema.brand("WatchAlertId"))
export type WatchAlertId = typeof WatchAlertId.Type

export const JobId = Schema.Int.pipe(Schema.brand("JobId"))
export type JobId = typeof JobId.Type

// --- Watch ---

export const FilterGroupModeSchema = Schema.Literals(["AND", "OR"])
export type FilterGroupMode = typeof FilterGroupModeSchema.Type

export const FilterGroupSchema = Schema.Struct({
  mode: FilterGroupModeSchema,
  substrings: Schema.Array(Schema.String),
})
export type FilterGroup = typeof FilterGroupSchema.Type

export const WatchSchema = Schema.Struct({
  id: WatchId,
  name: Schema.String,
  enabled: Schema.Boolean,
  query: Schema.String,
  intervalSeconds: Schema.Finite,
  filterGroups: Schema.Array(FilterGroupSchema),
  // Copyparty destination folder — presence is the book/non-book
  // discriminant: set means run the full pipeline into this folder,
  // empty means just save the magnet to AllDebrid.
  subfolder: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  unreadCount: Schema.optional(Schema.Finite),
})
export type Watch = typeof WatchSchema.Type

export interface WatchWithUnread extends Watch {
  unreadCount: number
}

// --- WatchAlert ---

export const WatchAlertSchema = Schema.Struct({
  id: WatchAlertId,
  watchId: WatchId,
  guid: Schema.String,
  title: Schema.String,
  magnetUrl: Schema.NullOr(Schema.String),
  downloadUrl: Schema.NullOr(Schema.String),
  size: Schema.Finite,
  seeders: Schema.Finite,
  indexer: Schema.String,
  matchedAt: Schema.Finite,
  acknowledged: Schema.Boolean,
})
export type WatchAlert = typeof WatchAlertSchema.Type

// --- Job ---

export const JobSchema = Schema.Struct({
  id: JobId,
  title: Schema.String,
  stage: JobStageSchema,
  progress: Schema.Finite,
  error: Schema.optional(Schema.String),
  startedAt: Schema.Finite,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type Job = typeof JobSchema.Type

// --- ProwlarrResult ---

export const ProwlarrResultSchema = Schema.Struct({
  title: Schema.String,
  guid: Schema.String,
  magnetUrl: Schema.NullOr(Schema.String),
  downloadUrl: Schema.NullOr(Schema.String),
  size: Schema.Finite,
  seeders: Schema.Finite,
  indexer: Schema.String,
  categories: Schema.Array(Schema.String),
  publishDate: Schema.NullOr(Schema.String),
})
export type ProwlarrResult = typeof ProwlarrResultSchema.Type

// --- AnnasArchiveResult ---

export const AnnasArchiveResultSchema = Schema.Struct({
  md5: Schema.String,
  title: Schema.String,
  author: Schema.NullOr(Schema.String),
  extension: Schema.NullOr(Schema.String),
  size: Schema.NullOr(Schema.String),
  language: Schema.NullOr(Schema.String),
  coverUrl: Schema.NullOr(Schema.String),
})
export type AnnasArchiveResult = typeof AnnasArchiveResultSchema.Type

// --- AppConfig sub-schemas ---

export const ProwlarrConfigSchema = Schema.Struct({
  url: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
  apiKey: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
})
export type ProwlarrConfig = typeof ProwlarrConfigSchema.Type

export const AnnasArchiveConfigSchema = Schema.Struct({
  apiKey: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
  baseUrl: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed("https://annas-archive.gl"))),
})
export type AnnasArchiveConfig = typeof AnnasArchiveConfigSchema.Type

export const AlldebridConfigSchema = Schema.Struct({
  apiKey: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
})
export type AlldebridConfig = typeof AlldebridConfigSchema.Type

export const KccConfigSchema = Schema.Struct({
  dockerImage: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed("ghcr.io/ciromattia/kcc:latest"))),
  profile: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed("KoBO"))),
  format: Schema.Literals(["Auto", "MOBI", "EPUB", "CBZ", "KFX", "PDF"]).pipe(Schema.withDecodingDefaultType(Effect.succeed("Auto" as const))),
  mangaStyle: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  webtoon: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  twoPanel: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  upscale: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(true))),
  stretch: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  hq: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  gamma: Schema.Finite.pipe(Schema.withDecodingDefaultType(Effect.succeed(1.0))),
  cropping: Schema.Literals(["0", "1", "2"]).pipe(Schema.withDecodingDefaultType(Effect.succeed("1" as const))),
  croppingPower: Schema.Finite.pipe(Schema.withDecodingDefaultType(Effect.succeed(1.0))),
  forceColor: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(true))),
  forcePng: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  noAutoContrast: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  blackBorders: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  whiteBorders: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  splitter: Schema.Literals(["0", "1", "2"]).pipe(Schema.withDecodingDefaultType(Effect.succeed("0" as const))),
  noProcessing: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  eraseRainbow: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(true))),
  coverFill: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
  batchSplit: Schema.Literals(["0", "1", "2"]).pipe(Schema.withDecodingDefaultType(Effect.succeed("0" as const))),
  targetSize: Schema.Finite.pipe(Schema.withDecodingDefaultType(Effect.succeed(0))),
  customWidth: Schema.Finite.pipe(Schema.withDecodingDefaultType(Effect.succeed(0))),
  customHeight: Schema.Finite.pipe(Schema.withDecodingDefaultType(Effect.succeed(0))),
  noKepub: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
})
export type KccConfig = typeof KccConfigSchema.Type

const KccConfigDefaults = Schema.decodeUnknownSync(KccConfigSchema)({})

export const CopypartyConfigSchema = Schema.Struct({
  url: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
  uploadPath: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed("/"))),
  password: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
})
export type CopypartyConfig = typeof CopypartyConfigSchema.Type

export const KomgaConfigSchema = Schema.Struct({
  url: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
  apiKey: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
  defaultLibraryId: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
})
export type KomgaConfig = typeof KomgaConfigSchema.Type

export const TelegramConfigSchema = Schema.Struct({
  botToken: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
  chatId: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
})
export type TelegramConfig = typeof TelegramConfigSchema.Type

export const GeneralConfigSchema = Schema.Struct({
  // The app's own externally-reachable URL (e.g. behind a reverse proxy) —
  // used to build links back into the web UI from places that can't infer
  // it themselves, like Telegram notifications. Empty means "unknown"; such
  // links are omitted rather than built with a wrong guess.
  publicUrl: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed(""))),
})
export type GeneralConfig = typeof GeneralConfigSchema.Type

export const AppConfigSchema = Schema.Struct({
  prowlarr: ProwlarrConfigSchema.pipe(Schema.withDecodingDefaultType(Effect.succeed({ url: "", apiKey: "" }))),
  alldebrid: AlldebridConfigSchema.pipe(Schema.withDecodingDefaultType(Effect.succeed({ apiKey: "" }))),
  kcc: KccConfigSchema.pipe(Schema.withDecodingDefaultType(Effect.succeed(KccConfigDefaults))),
  copyparty: CopypartyConfigSchema.pipe(Schema.withDecodingDefaultType(Effect.succeed({ url: "", uploadPath: "/", password: "" }))),
  komga: KomgaConfigSchema.pipe(Schema.withDecodingDefaultType(Effect.succeed({ url: "", apiKey: "", defaultLibraryId: "" }))),
  annasArchive: AnnasArchiveConfigSchema.pipe(Schema.withDecodingDefaultType(Effect.succeed({ apiKey: "", baseUrl: "https://annas-archive.gl" }))),
  telegram: TelegramConfigSchema.pipe(Schema.withDecodingDefaultType(Effect.succeed({ botToken: "", chatId: "" }))),
  general: GeneralConfigSchema.pipe(Schema.withDecodingDefaultType(Effect.succeed({ publicUrl: "" }))),
})
export type AppConfig = typeof AppConfigSchema.Type

// --- Komga domain types ---

export const KomgaLibrarySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})
export type KomgaLibrary = typeof KomgaLibrarySchema.Type

export const KomgaSeriesSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  booksCount: Schema.Finite,
  metadata: Schema.Struct({ status: Schema.String, title: Schema.String }),
})
export type KomgaSeries = typeof KomgaSeriesSchema.Type

export const KomgaBookSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  number: Schema.Finite,
  created: Schema.String,
  size: Schema.String,
  media: Schema.Struct({ pagesCount: Schema.Finite, mediaType: Schema.String }),
  metadata: Schema.Struct({ title: Schema.String, number: Schema.String }),
})
export type KomgaBook = typeof KomgaBookSchema.Type

// --- Debrid types ---

export const DebridFileSchema = Schema.Struct({
  filename: Schema.String,
  link: Schema.String,
  size: Schema.Finite,
})
export type DebridFile = typeof DebridFileSchema.Type

export const UploadResultSchema = Schema.Struct({
  id: Schema.Finite,
  ready: Schema.Boolean,
})
export type UploadResult = typeof UploadResultSchema.Type

// --- MatchResult ---

export const MatchResultSchema = Schema.Struct({
  seriesId: Schema.String,
  seriesName: Schema.String,
  score: Schema.Finite,
  booksCount: Schema.Finite,
})
export type MatchResult = typeof MatchResultSchema.Type
