import { Schema } from "effect";

// --- Primitives ---

export const JobStageSchema = Schema.Literal(
  "UPLOADING",
  "DEBRID_PROCESSING",
  "DOWNLOADING",
  "CONVERTING",
  "UPLOADING_COPYPARTY",
  "DONE",
  "FAILED",
);
export type JobStage = typeof JobStageSchema.Type;

// --- Job ---

export const JobSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  stage: JobStageSchema,
  progress: Schema.Number,
  error: Schema.optional(Schema.String),
  startedAt: Schema.Number,
});
export type Job = typeof JobSchema.Type;

// --- ProwlarrResult ---

export const ProwlarrResultSchema = Schema.Struct({
  title: Schema.String,
  guid: Schema.String,
  magnetUrl: Schema.NullOr(Schema.String),
  downloadUrl: Schema.NullOr(Schema.String),
  size: Schema.Number,
  seeders: Schema.Number,
  indexer: Schema.String,
  categories: Schema.Array(Schema.String),
  publishDate: Schema.NullOr(Schema.String),
});
export type ProwlarrResult = typeof ProwlarrResultSchema.Type;

// --- AppConfig sub-schemas ---

export const ProwlarrConfigSchema = Schema.Struct({
  url: Schema.optionalWith(Schema.String, { default: () => "" }),
  apiKey: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type ProwlarrConfig = typeof ProwlarrConfigSchema.Type;

export const AlldebridConfigSchema = Schema.Struct({
  apiKey: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type AlldebridConfig = typeof AlldebridConfigSchema.Type;

export const KccConfigSchema = Schema.Struct({
  dockerImage: Schema.optionalWith(Schema.String, {
    default: () => "ghcr.io/ciromattia/kcc:latest",
  }),
  profile: Schema.optionalWith(Schema.String, { default: () => "KoBO" }),
  format: Schema.optionalWith(
    Schema.Literal("Auto", "MOBI", "EPUB", "CBZ", "KFX", "PDF"),
    { default: () => "Auto" as const },
  ),
  mangaStyle: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  webtoon: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  twoPanel: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  upscale: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  stretch: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  hq: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  gamma: Schema.optionalWith(Schema.Number, { default: () => 1.0 }),
  cropping: Schema.optionalWith(Schema.Literal("0", "1", "2"), {
    default: () => "1" as const,
  }),
  croppingPower: Schema.optionalWith(Schema.Number, {
    default: () => 1.0,
  }),
  forceColor: Schema.optionalWith(Schema.Boolean, {
    default: () => true,
  }),
  forcePng: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  noAutoContrast: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  blackBorders: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  whiteBorders: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  splitter: Schema.optionalWith(Schema.Literal("0", "1", "2"), {
    default: () => "0" as const,
  }),
  noProcessing: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  eraseRainbow: Schema.optionalWith(Schema.Boolean, {
    default: () => true,
  }),
  coverFill: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  batchSplit: Schema.optionalWith(Schema.Literal("0", "1", "2"), {
    default: () => "0" as const,
  }),
  targetSize: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  customWidth: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  customHeight: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  noKepub: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
});
export type KccConfig = typeof KccConfigSchema.Type;

const KccConfigDefaults = Schema.decodeUnknownSync(KccConfigSchema)({});

export const CopypartyConfigSchema = Schema.Struct({
  url: Schema.optionalWith(Schema.String, { default: () => "" }),
  uploadPath: Schema.optionalWith(Schema.String, { default: () => "/" }),
  password: Schema.optionalWith(Schema.String, { default: () => "" }),
});
export type CopypartyConfig = typeof CopypartyConfigSchema.Type;

export const KomgaConfigSchema = Schema.Struct({
  url: Schema.optionalWith(Schema.String, { default: () => "" }),
  apiKey: Schema.optionalWith(Schema.String, { default: () => "" }),
  defaultLibraryId: Schema.optionalWith(Schema.String, {
    default: () => "",
  }),
});
export type KomgaConfig = typeof KomgaConfigSchema.Type;

export const AppConfigSchema = Schema.Struct({
  prowlarr: Schema.optionalWith(ProwlarrConfigSchema, {
    default: () => ({ url: "", apiKey: "" }),
  }),
  alldebrid: Schema.optionalWith(AlldebridConfigSchema, {
    default: () => ({ apiKey: "" }),
  }),
  kcc: Schema.optionalWith(KccConfigSchema, {
    default: () => KccConfigDefaults,
  }),
  copyparty: Schema.optionalWith(CopypartyConfigSchema, {
    default: () => ({ url: "", uploadPath: "/", password: "" }),
  }),
  komga: Schema.optionalWith(KomgaConfigSchema, {
    default: () => ({ url: "", apiKey: "", defaultLibraryId: "" }),
  }),
});
export type AppConfig = typeof AppConfigSchema.Type;

// --- Komga domain types ---

export const KomgaLibrarySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
});
export type KomgaLibrary = typeof KomgaLibrarySchema.Type;

export const KomgaSeriesSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  booksCount: Schema.Number,
  metadata: Schema.Struct({
    status: Schema.String,
    title: Schema.String,
  }),
});
export type KomgaSeries = typeof KomgaSeriesSchema.Type;

export const KomgaBookSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  number: Schema.Number,
  created: Schema.String,
  size: Schema.String,
  media: Schema.Struct({
    pagesCount: Schema.Number,
    mediaType: Schema.String,
  }),
  metadata: Schema.Struct({
    title: Schema.String,
    number: Schema.String,
  }),
});
export type KomgaBook = typeof KomgaBookSchema.Type;

// --- Debrid types ---

export const DebridFileSchema = Schema.Struct({
  filename: Schema.String,
  link: Schema.String,
  size: Schema.Number,
});
export type DebridFile = typeof DebridFileSchema.Type;

export const UploadResultSchema = Schema.Struct({
  id: Schema.Number,
  ready: Schema.Boolean,
});
export type UploadResult = typeof UploadResultSchema.Type;

// --- MatchResult ---

export const MatchResultSchema = Schema.Struct({
  seriesId: Schema.String,
  seriesName: Schema.String,
  score: Schema.Number,
  booksCount: Schema.Number,
});
export type MatchResult = typeof MatchResultSchema.Type;

// --- Watch ---

export const FilterGroupModeSchema = Schema.Literal("AND", "OR");
export type FilterGroupMode = typeof FilterGroupModeSchema.Type;

export const FilterGroupSchema = Schema.Struct({
  mode: FilterGroupModeSchema,
  substrings: Schema.Array(Schema.String),
});
export type FilterGroup = typeof FilterGroupSchema.Type;

export const WatchSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  enabled: Schema.Boolean,
  query: Schema.String,
  intervalSeconds: Schema.Number,
  filterGroups: Schema.Array(FilterGroupSchema),
});
export type Watch = typeof WatchSchema.Type;

export const WatchAlertSchema = Schema.Struct({
  id: Schema.String,
  watchId: Schema.String,
  guid: Schema.String,
  title: Schema.String,
  magnetUrl: Schema.NullOr(Schema.String),
  size: Schema.Number,
  seeders: Schema.Number,
  indexer: Schema.String,
  matchedAt: Schema.Number,
  acknowledged: Schema.Boolean,
});
export type WatchAlert = typeof WatchAlertSchema.Type;
