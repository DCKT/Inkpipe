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

Monorepo with three packages:
- `packages/shared` — Effect Schema domain types, RPC contracts, error types, utility functions. RPC groups in `src/rpc/` define typed endpoints with payload/success/error schemas.
- `packages/server` — Bun HTTP server with Effect TS. Bun SQLite for persistence. All IO via Effect services. RPC handlers in `src/rpc/handlers/` implement group handlers, mounted via `RpcServer.toWebHandler()` at `POST /api/rpc`.
- `packages/web` — React SPA with React Router v7, TanStack React Query, Tailwind CSS v4. API calls via Effect/RPC client (`RpcClient`), types inferred from shared RPC contracts.

## API Communication

```
Frontend (Effect/RPC RpcClient) ─── HTTP POST /api/rpc (NDJSON) ─── Server (RpcServer.toWebHandler)
     │                                                                      │
     │ typed Effect<E, A>                                                   │ typed Effect<E, A>  
     │ catchTag("NotFoundError", ...)                                       │ yield* Service.method()
     ▼                                                                      ▼
  React hook                                                          Layer service
```

- **RPC Group** — A namespaced set of typed procedures (e.g. `SearchRpc`, `WatchRpc`). Each group exports its own error union.
- **RpcClient** — Effect-based client instantiated from an `RpcGroup`. Calls like `client.search.query(q)` return `Effect<Result, TypedError>`.
- **RpcServer.toWebHandler** — Converts an `RpcGroup` + handler layer into a web-standard `(Request) => Promise<Response>` handler. Mounts at a single HTTP endpoint.
- **NDJSON** — Newline-delimited JSON serialization. The RPC wire protocol uses NDJSON for streaming-friendly request/response encoding.

## Glossary

- **Pipeline** — The full workflow from Prowlarr search result to completed conversion
- **Job** — A tracked pipeline execution
- **Magnet** — A torrent reference uploaded to AllDebrid for debrid processing
- **Debrid** — AllDebrid service that resolves torrents to direct downloads

## Flagged ambiguities

- "API" was used to mean both the REST endpoints and the shared schema types — resolved: RPC contracts are the canonical API. `shared/src/api.ts` schemas are deprecated, replaced by `shared/src/rpc/` RPC groups.

## Example dialogue

> **Dev:** "I need to add a new endpoint for bulk acknowledging alerts. Where do I define it?"
> **Domain expert:** "Add an `acknowledgeMany` RPC to the Watch group in `shared/src/rpc/watches.ts`, implement it in `server/src/rpc/handlers/watches.ts` calling `WatchStoreService`, then call it from the frontend with `rpcClient.watches.acknowledgeMany(ids)`."
> **Dev:** "How are errors surfaced on the frontend?"
> **Domain expert:** "The handler's Effect error channel becomes the RPC's error schema. On the frontend, use `Effect.catchTag('WatchNotFoundError', ...)` — no string matching."
