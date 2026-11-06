## Architecture

```
┌─────────────────────────────────────────────┐
│              FRONTEND (packages/web)         │
│  Foldkit (Elm architecture on Effect)        │
│  + @foldkit/ui, typed HttpApiClient          │
└─────────────────────────────────────────────┘
                    │ HTTP (typed client)
                    ▼
┌─────────────────────────────────────────────┐
│              SERVER (packages/server)         │
│  Effect services + Bun.serve HTTP routes     │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│            PERSISTENCE (packages/db)          │
│  @effect/sql-sqlite-bun at ~/.inkpipe/inkpipe.db │
│  WAL mode — allows concurrent readers        │
└─────────────────────────────────────────────┘
           ▲                    ▲
           │ SQLite             │ SQLite
┌──────────┴────────────────────┴──────────────┐
│  WATCHER (packages/watcher)   │  SERVER       │
│  Effect process                │  (same DB)    │
│  Reuses: ConfigService,        │               │
│  ProwlarrService,              │               │
│  WatchStoreService             │               │
│  Sends push notifs             │               │
└───────────────────────────────────────────────┘
```

## Project Structure

```
inkpipe/
├── packages/
│   ├── shared/          # Schemas, types, errors shared between client and server
│   │   └── src/
│   │       ├── schemas.ts       # Effect Schema domain types
│   │       ├── api.ts           # API request/response schemas
│   │       ├── errors.ts        # Tagged error classes
│   │       └── titleMatch.ts    # Title matching utility
│   ├── server/          # Bun runtime, Effect layers, HTTP routes  ← BACKEND
│   │   └── src/
│   │       ├── main.ts          # Entry point
│   │       ├── layers/          # Effect services (business logic + data access)
│   │       └── routes/          # HTTP route handlers
│   ├── watcher/         # Standalone Bun process, Effect-based (reuses server layers) ← WATCHER
│   │   └── src/
│   │       ├── index.ts         # Entry point — loads watches, runs scheduler
│   │       ├── config.ts        # Prowlarr config from shared SQLite
│   │       ├── store.ts         # Watch + alert SQLite access
│   │       ├── prowlarr.ts      # Prowlarr search client
│   │       └── push.ts          # Web push notification sender
│   └── web/             # Foldkit SPA (Elm architecture)            ← FRONTEND
│       ├── public/
│       │   └── sw.js            # Service worker (push notifications)
│       └── app/
│           ├── entry.ts         # Runtime bootstrap
│           ├── main.ts          # Root Model/Message/update/view, routing, OutMessage folds
│           ├── route.ts         # Route union + parsers
│           ├── api.ts           # Typed client service + callApi
│           ├── <page>.ts        # One Submodel per page (settings, watches, komga, ...)
│           └── *.test.ts        # Story / Scene / Command tests next to the code
├── docs/
│   ├── adr/             # Architectural decisions
│   │   ├── 0006-filter-group-dsl.md   # Watch filter DSL
│   │   └── 0007-watcher-package.md    # Watcher as standalone package
│   ├── agents/          # Agent workflow docs (issue tracker, triage, domain)
│   └── guides/          # Development guides
│       ├── effect-guide.md
│       └── api-guide.md
└── repos/
    └── effect/          # Vendored Effect-TS source (read-only reference)
```

## 🚨 CRITICAL: ALWAYS RUN THE TEST SUITE 🚨

**`bun run test` MUST be run before any change is reported as done — every time, no exceptions.** Typechecking is not a substitute: `bun run typecheck` catches type errors, not runtime/module-resolution breakage (e.g. a Node-incompatible import newly reachable from a widely-imported module) or logic regressions. Run both `bun run test` and `bun run typecheck` as the last step of every change, however small it looks.

## 🚨 CRITICAL: BACKEND AND FRONTEND MUST STAY ALIGNED 🚨

**This is a HARD REQUIREMENT. When implementing features:**

1. **NEVER do frontend-only changes** for features that need backend work
2. **ALWAYS update both layers** - packages/web AND packages/server, packages/shared
3. **Frontend workarounds are NOT acceptable** - if the spec says "update API", update the API
4. **Run tests** - `bun run test && bun run typecheck` MUST pass before marking work complete

**Data flow**: Frontend (web) → HTTP (typed client) → Server routes → Layer services → SQLite
**Watcher flow**: Watcher (Effect process) → reuses server layers (ConfigService, ProwlarrService, WatchStoreService) → SQLite → sends push
**All layers must be consistent.**

## 🚫 NEVER RUN DOCKER FOR INFRASTRUCTURE

**Do NOT run `docker run`, `docker compose`, or `docker-compose` to set up dev databases or infrastructure.** The app uses SQLite in-process — no external database container is needed. Do not attempt to manage the database or test infrastructure with Docker.

**Exception:** The project uses `docker-compose.yml` for deployment and spawns `docker run`/`docker exec` at runtime for KCC comic conversion. These are part of the application's normal operation and the `docker-publish.yml` CI workflow, not agent-ran commands.

## Key Files

| File                                                                         | Purpose                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `PLAN.md`                                                                    | High-level project plan and roadmap                                   |
| `vitest.config.ts`                                                           | Test project configuration (shared, server, web)                      |
| `packages/server/src/main.ts`                                                | Server entry point — composes layers, starts Bun.serve                |
| `packages/watcher/src/index.ts`                                              | Watcher entry point — loads watches, runs scheduler                   |
| `packages/web/app/main.ts`                                                   | Frontend root: Model, update, view, routing, subscriptions            |
| `packages/web/app/route.ts`                                                  | Route union and URL parsers                                           |
| `packages/web/app/api.ts`                                                    | Typed API client service + `callApi` (all API calls go through this)  |
| https://github.com/9001/copyparty/blob/hovudstraum/docs/devnotes.md#http-api | Copyparty HTTP API reference                                          |
| https://docs.alldebrid.com/#magnet                                           | AllDebrid API reference (auth: Bearer header, /v4/magnet/* endpoints) |

## Quick Start: Critical Rules

### Backend (Effect code in packages/server, packages/shared)

**Read `docs/guides/effect-guide.md` and `docs/guides/api-guide.md` first.** Key rules:

1. **NEVER use `any` or type casts** — use `Schema.decodeUnknown`, `identity`
2. **NEVER use global `Error`** — use `Schema.TaggedErrorClass` for all domain errors
3. **NEVER use `catchCause`** — it catches defects (bugs); use `catch` or `mapError`
4. **NEVER use `disableValidation: true`** — banned by lint rule
5. **NEVER use `*FromSelf` schemas** — use standard variants (`Schema.Option`, not `OptionFromSelf`)
6. **NEVER use Sync variants** — use `Schema.decodeUnknown` not `decodeUnknownSync`
7. **Flat modules, no barrel files** — `ProwlarrService.ts`, not `services/prowlarr/index.ts`
8. **Prefer `Schema.Class` over `Schema.Struct`** — classes give constructor, `Equal`, `Hash`
9. **Use `Schema.TaggedErrorClass`** for domain errors — `Schema.is()` for type guards
10. **Use branded types** for IDs where appropriate
11. **Use `Layer.effect` or `Layer.scoped`** — avoid `Layer.succeed` and `Tag.of`
12. **ALWAYS use precise domain schemas** — never lose type precision by using primitives when a richer domain type exists

### Frontend (Foldkit code in packages/web)

The frontend is a Foldkit app (Elm architecture on Effect; see ADR 0009). The vendored source in `repos/foldkit` is the reference. Key patterns:

1. **Model / Message / update / view per page** — each page is a Submodel in its own flat module; the root (`main.ts`) folds children with `Update.foldChild*`
2. **No side effects in `update` or `view`** — HTTP, browser APIs and timers live in `Command`s, `Mount`s and `Subscription`s
3. **All HTTP goes through `callApi`** (typed `InkpipeApi` client) — Commands turn failures into Messages, never throw. Exception: the dev-only Debug page
4. **Page → root communication uses OutMessages** (toasts, sidebar refresh, navigation); pages never touch each other's state
5. **Guard async answers** — tag requests with a sequence number or entity id and ignore stale answers
6. **Handle empty, loading and error states** — every list/data view needs all three, with the error shown where the user can see it (inside a Dialog, never a toast behind it)

## Quick Reference Commands

```
bun run dev           # Start dev server (server + web + watcher concurrently)
bun run build         # Build web for production
bun run test          # Run tests (vitest)
bun run test:watch    # Run tests in watch mode
bun run typecheck     # TypeScript type checking
bun run lint          # oxlint (lint:fix to autofix)
bun run format        # oxfmt (format:check to verify)
```

## Implementation Guidelines

### Backend (packages/shared + packages/server)

**Effect-based** — functional, type-safe, composable. Shared schemas in `shared/`, layer services in `server/src/layers/`, route handlers in `server/src/routes/`.

**Read these docs:**

- `docs/guides/effect-guide.md` — Effect patterns, layers, errors, SQL, testing
- `docs/guides/api-guide.md` — HTTP routes, endpoints, schemas

**Guidelines:**

1. **Define schemas first** — domain types in `packages/shared/src/schemas.ts`, API contracts in `packages/shared/src/api.ts`
2. **Errors in `packages/shared/src/errors.ts`** — use `Schema.TaggedErrorClass` for all domain errors
3. **Services as Effect layers** — each `.ts` file in `server/src/layers/` exports a service class and its live implementation
4. **Routes call services** — route handlers in `server/src/routes/` import and call layer services, never access SQLite directly
5. **Layers compose in `main.ts`** — service dependencies are wired via `Layer.provide`

### Watcher (packages/watcher)

**Effect-based process** — reuses server layer services. Separate Bun process for fault isolation. Shares the same SQLite database (`~/.inkpipe/inkpipe.db`) with the server via `@inkpipe/db`.

**Guidelines:**

1. **Reuse layer services** — imports `ConfigService`, `ProwlarrService`, `WatchStoreService` from server layers. Composes its own Effect runtime.
2. **Must not crash the server** — runs as a separate process. Server continues serving if watcher goes down.
3. **Shares DB safely** — SQLite WAL mode allows concurrent readers. Uses `@inkpipe/db` for consistent schema.

### Frontend (packages/web)

**Read an existing page** (e.g. `web/app/watches.ts` + `watches.test.ts`) for conventions.

**Guidelines:**

1. **Use `callApi` for all HTTP calls** — never raw `fetch` (except the Debug page)
2. **Type API responses** — use shared types from `@inkpipe/shared`; use branded ids
3. **Handle loading, empty, and error states** — every data-fetching page needs all three
4. **Use `@foldkit/ui` primitives** (Dialog, Select, Checkbox, Input, Toast, ...) through the helpers in `form.ts`
5. **Test every page** — Story tests for `update`, Scene tests for `view`, stubbed-`HttpClient` tests for Commands, `TestClock` for subscriptions
6. For any Foldkit interrogation, read `repos/foldkit` (its `CLAUDE.md` is Foldkit's own contributor guide, not this project's rules)

### Full Stack Features

When implementing a feature that spans layers:

1. **Shared schemas/types** in `packages/shared`
2. **Layer service** in `packages/server/src/layers/`
3. **Route handler** in `packages/server/src/routes/`
4. **Frontend page + API calls** in `packages/web`
5. **Watcher integration** (if needed) in `packages/watcher` — any feature that needs recurring background work

## Vendored Repositories

This project vendors external repositories under @repos/

- Use vendored repositories as read-only reference material when working with related libraries
- Prefer examples and patterns from the vendored source code over generated guesses or web search results
- Do not edit files under @repos/ unless explicitly asked
- Do not import from @repos/ - application code should continue importing from normal package dependencies

### Issue tracker

Issues live in GitHub Issues on `DCKT/Inkpipe`. All operations use the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage role labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` at root, one `docs/adr/` for architectural decisions. See `docs/agents/domain.md`.
