# Inkpipe

Manga/comic pipeline: search for content via Prowlarr, download torrents via AllDebrid, convert via KCC, upload to Copyparty, browse Komga library.

## Domain

- **ProwlarrResult** — A search result from Prowlarr. Has a title, magnet URL or torrent download URL, size, seeders, and indexer info.
- **Pipeline** — Full download→convert→upload flow. Stages: uploading, debrid processing, downloading, converting, copyparty upload, done/failed.
- **Job** — Tracks a pipeline execution. Has an ID, title, stage (one of the pipeline stages), progress (0-100), optional error.
- **Config** — Application settings persisted to SQLite. Sections: Prowlarr (URL, API key), AllDebrid (API key), KCC (docker image, profile, format + ~20 conversion options), Copyparty (URL, path, password), Komga (URL, API key, default library).
- **KCC** — Kindle Comic Converter. Docker container that converts CBZ/CBR/ZIP/RAR/PDF to EPUB (or other formats).
- **Komga Library** — A comic/manga library with series, books, and thumbnails. Supports per-library browsing.
- **Copyparty** — File hosting. Optional target for uploading converted files with subfolder organization.
- **Watch** — A saved recurring Prowlarr search with title filter criteria. Runs on a configurable interval and generates alerts when new Prowlarr results match.
- **FilterGroup** — A set of title substrings combined by AND or OR for matching Prowlarr results. All groups on a Watch are AND'd together.
- **WatchAlert** — A single Prowlarr result that matched a Watch. Unique per (Watch, Prowlarr GUID). Can be acknowledged/dismissed.

## Architecture

Monorepo with five packages:
- `packages/shared` — Effect Schema domain types, API contracts, error types, utility functions
- `packages/db` — SQLite database connection factory via `@effect/sql-sqlite-bun`, versioned migrations, shared by server and watcher
- `packages/server` — Bun HTTP server with Effect TS. `@effect/sql` (`@effect/sql-sqlite-bun`) for persistence. All IO via Effect services.
- `packages/watcher` — Effect-based scheduled process. Reuses server layer services (ConfigService, ProwlarrService, WatchStoreService) for Watch scheduling and alert generation. Runs as a separate Bun process for fault isolation.
- `packages/web` — React SPA with React Router v7, TanStack React Query, Tailwind CSS v4. Communicates with server via REST API.

## Glossary

- **Pipeline** — The full workflow from Prowlarr search result to completed conversion
- **Job** — A tracked pipeline execution
- **Magnet** — A torrent reference uploaded to AllDebrid for debrid processing
- **Debrid** — AllDebrid service that resolves torrents to direct downloads
