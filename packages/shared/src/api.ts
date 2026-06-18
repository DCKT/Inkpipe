import { Schema } from "effect";
import {
  ProwlarrResultSchema,
  JobSchema,
  AppConfigSchema,
  KomgaLibrarySchema,
  KomgaSeriesSchema,
  KomgaBookSchema,
  WatchSchema,
  WatchAlertSchema,
} from "./schemas";

// --- Search / Latest ---

export const SearchResponseSchema = Schema.Struct({
  results: Schema.Array(ProwlarrResultSchema),
});
export type SearchResponse = typeof SearchResponseSchema.Type;

export const LatestResponseSchema = Schema.Struct({
  results: Schema.Array(ProwlarrResultSchema),
});
export type LatestResponse = typeof LatestResponseSchema.Type;

// --- Download ---

export const DownloadRequestSchema = Schema.Struct({
  items: Schema.Array(ProwlarrResultSchema),
  subfolder: Schema.optional(Schema.String),
  newFolder: Schema.optional(Schema.Boolean),
});
export type DownloadRequest = typeof DownloadRequestSchema.Type;

export const DownloadResponseSchema = Schema.Struct({
  started: Schema.Number,
});
export type DownloadResponse = typeof DownloadResponseSchema.Type;

// --- Jobs ---

export const JobsResponseSchema = Schema.Struct({
  jobs: Schema.Array(JobSchema),
});
export type JobsResponse = typeof JobsResponseSchema.Type;

// --- Settings ---

export const SettingsResponseSchema = AppConfigSchema;
export type SettingsResponse = typeof SettingsResponseSchema.Type;

// --- Convert/Upload ---

export const ConvertUploadResponseSchema = Schema.Struct({
  id: Schema.String,
  filename: Schema.String,
});
export type ConvertUploadResponse = typeof ConvertUploadResponseSchema.Type;

// --- Komga ---

export const KomgaLibrariesResponseSchema = Schema.Struct({
  libraries: Schema.Array(KomgaLibrarySchema),
});
export type KomgaLibrariesResponse = typeof KomgaLibrariesResponseSchema.Type;

export const KomgaSeriesResponseSchema = Schema.Struct({
  series: Schema.Array(KomgaSeriesSchema),
});
export type KomgaSeriesResponse = typeof KomgaSeriesResponseSchema.Type;

export const KomgaBooksResponseSchema = Schema.Struct({
  books: Schema.Array(KomgaBookSchema),
});
export type KomgaBooksResponse = typeof KomgaBooksResponseSchema.Type;

export const KomgaThumbnailResponseSchema = Schema.String;
export type KomgaThumbnailResponse = typeof KomgaThumbnailResponseSchema.Type;

// --- Copyparty ---

export const CopypartyFoldersResponseSchema = Schema.Struct({
  folders: Schema.Array(Schema.String),
});
export type CopypartyFoldersResponse = typeof CopypartyFoldersResponseSchema.Type;

export const CreateFolderRequestSchema = Schema.Struct({
  name: Schema.String,
});
export type CreateFolderRequest = typeof CreateFolderRequestSchema.Type;

export const CreateFolderResponseSchema = Schema.Struct({
  name: Schema.String,
});
export type CreateFolderResponse = typeof CreateFolderResponseSchema.Type;

// --- Watches ---

export const WatchesListResponseSchema = Schema.Struct({
  watches: Schema.Array(WatchSchema),
});
export type WatchesListResponse = typeof WatchesListResponseSchema.Type;

export const WatchResponseSchema = WatchSchema;
export type WatchResponse = typeof WatchResponseSchema.Type;

export const CreateWatchRequestSchema = Schema.Struct({
  name: Schema.String,
  query: Schema.String,
  intervalSeconds: Schema.Number,
  filterGroups: Schema.Array(Schema.Struct({
    mode: Schema.Literal("AND", "OR"),
    substrings: Schema.Array(Schema.String),
  })),
});
export type CreateWatchRequest = typeof CreateWatchRequestSchema.Type;

export const UpdateWatchRequestSchema = Schema.Struct({
  name: Schema.optional(Schema.String),
  enabled: Schema.optional(Schema.Boolean),
  query: Schema.optional(Schema.String),
  intervalSeconds: Schema.optional(Schema.Number),
  filterGroups: Schema.optional(Schema.Array(Schema.Struct({
    mode: Schema.Literal("AND", "OR"),
    substrings: Schema.Array(Schema.String),
  }))),
});
export type UpdateWatchRequest = typeof UpdateWatchRequestSchema.Type;

export const WatchAlertsResponseSchema = Schema.Struct({
  alerts: Schema.Array(WatchAlertSchema),
});
export type WatchAlertsResponse = typeof WatchAlertsResponseSchema.Type;

export const UnreadCountResponseSchema = Schema.Struct({
  count: Schema.Number,
});
export type UnreadCountResponse = typeof UnreadCountResponseSchema.Type;

export const PushSubscriptionRequestSchema = Schema.Struct({
  endpoint: Schema.String,
  keys: Schema.Struct({
    p256dh: Schema.String,
    auth: Schema.String,
  }),
});
export type PushSubscriptionRequest = typeof PushSubscriptionRequestSchema.Type;

// --- Clear Jobs ---

export const ClearJobsResponseSchema = Schema.Struct({
  deleted: Schema.Number,
})
export type ClearJobsResponse = typeof ClearJobsResponseSchema.Type

// --- Error ---

export const ErrorResponseSchema = Schema.Struct({
  error: Schema.String,
});
export type ErrorResponse = typeof ErrorResponseSchema.Type;
