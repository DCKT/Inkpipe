# ADR 0002: Effect + Bun SPA Refactor

## Context

Inkpipe v1 was a TanStack Start monolith (React SSR + server functions). We needed to:
- Remove TanStack Start, Router, Router Plugin (keeping only React Query)
- Split into separate server + frontend projects
- Use Bun APIs for all server operations
- Enforce Effect TS v3 for all IO with typed errors and dependency injection
- Use Bun SQLite for persistence
- Test everything with Vitest

## Decision

Three-package monorepo:

1. **`packages/shared`** — Effect Schema domain types, API contracts, TaggedError hierarchy. Shared by server and frontend for end-to-end type safety.

2. **`packages/server`** — Bun HTTP server (Bun.serve) with Effect TS:
   - All IO is in Effect services behind `Effect.Tag`
   - Bun SQLite for config and job persistence
   - `Bun.$` for Docker/KCC and unrar shell commands
   - `Bun.fetch`/`Bun.write` for file downloads
   - Pipeline orchestration via `Effect.gen`
   - Error mapping via `Effect.catchTags` at HTTP boundaries

3. **`packages/web`** — React SPA:
   - React Router v7 for client routing (file-based via `@react-router/dev`)
   - TanStack React Query for data fetching with REST API calls
   - Tailwind CSS v4 for styling
   - Ky for HTTP client

## Alternatives considered

- **Hono/Elysia over Bun.serve**: More middleware, but ~10 endpoints don't justify extra deps. Bun.serve routes via switch() are sufficient.
- **`@effect/sql` for SQLite**: Custom wrapper around Bun SQLite was simpler and has zero extra deps. Swappable later via Tag interface.
- **Effect HttpClient over Ky for external APIs**: Ky is npm, not Bun-native. Using native `fetch` with Effect wrappers preserves fewer deps.
- **JSON file config over SQLite**: SQLite gives us persistence for jobs across restarts. Config could stay as JSON but having everything in one DB is simpler.

## Consequences

- No SSR — the frontend is a pure SPA. Acceptable for a local network app.
- Bun.serve serves both API and static frontend in production (single process).
- Build produces `packages/web/dist/` via Vite, served by Bun server.
- Docker: switch from `node:22-slim` to `oven/bun:1-slim`.

## Status

Accepted (2026-06-13). The SQL alternative (raw `bun:sqlite`) was later superseded by [ADR 0007](./0007-effect-sql-migration.md) (2026-06-24), which migrated to `@effect/sql` + `@effect/sql-sqlite-bun`.
