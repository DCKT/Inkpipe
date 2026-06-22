# Architecture Review — Deepening Opportunities

## Candidate 1: Shared Database Initialization Module ✅ IMPLEMENTED

**Files**: `packages/server/src/layers/Config.ts:40-49`, `packages/server/src/layers/WatchStore.ts:43-66`, `packages/server/src/layers/JobStore.ts`, `packages/watcher/src/config.ts:11-49`

**Problem**: SQLite database connection and table creation was duplicated across 4 modules. Each independently called `new Database()`, enabled WAL, and ran `CREATE TABLE IF NOT EXISTS`. Each created its own `Database` instance. Changing a table schema required touching 2+ files (server layer + watcher config), and there was no guarantee they stayed in sync.

**Solution implemented**:
- New `packages/db` workspace with `DbService` (Effect Tag), `DbServiceLive` (Layer), and `getDb()` (plain function for watcher)
- All 4 tables created upfront in `getDb()` — singleton per process
- `ConfigService`, `WatchStoreService`, `JobStoreService` now inject `DbService` instead of privately opening connections
- Watcher imports `getDb()` from `@inkpipe/db`
- `DbServiceLive` added to `NoDepLayer` in `main.ts`
- 3 new tests for db package, existing tests updated to use mock `DbService` via `Effect.provideService`

**Results**: 199 tests pass, all 5 packages typecheck clean.



**Files**: `packages/server/src/layers/Config.ts:40-49`, `packages/server/src/layers/WatchStore.ts:43-66`, `packages/server/src/layers/JobStore.ts`, `packages/watcher/src/config.ts:11-49`

**Problem**: SQLite database connection and table creation is duplicated across 4 modules. Each independently calls `new Database()`, enables WAL, and runs `CREATE TABLE IF NOT EXISTS`. Each creates its own `Database` instance. Changing a table schema requires touching 2+ files (server layer + watcher config), and there's no guarantee they stay in sync.

**Deletion test**: If the DB init logic in `ConfigService` disappears, the complexity doesn't vanish — it's already replicated 3 other places. Inlining DB init into every layer is the anti-depth pattern.

**Solution**: Extract `getDb()` and all table DDL into a single module — either a new `packages/db` workspace, or DDL strings in shared. Server services and watcher both import from it.

**Benefits**: **Locality** — schema changes happen in one place. Adding a new table touches one file instead of two. **Testability** — tests mock a single db factory instead of setting up independent connections.

---

## Candidate 2: Duplicate Prowlarr HTTP Fetch Logic

**Files**: `packages/server/src/layers/Prowlarr.ts:100-115` (`doProwlarrSearch`), `packages/watcher/src/prowlarr.ts:10-24` (`searchProwlarr`)

**Problem**: The Prowlarr HTTP call — constructing the URL, setting `X-Api-Key`, `AbortSignal.timeout(30000)`, parsing JSON, pipe through `transformProwlarrResult` → `sortProwlarrResults` — exists in two places with identical logic. Shared already exports the transform/sort/URL helpers, but the HTTP fetch itself is duplicated.

**Deletion test**: Neither place hides the Prowlarr HTTP concern — both bleed it. Delete one and its complexity reappears in the other.

**Solution**: Move `fetchProwlarr(url, apiKey, params) → ProwlarrResult[]` into `packages/shared/src/prowlarr-client.ts` alongside existing helpers. Server wraps in `Effect.tryPromise`; watcher calls directly.

**Benefits**: **Leverage** — one implementation serves both. **Locality** — API changes (timeout, error format, auth) fixed once.

---

## Candidate 3: VAPID Key + Push Subscription Storage

**Files**: `packages/server/src/main.ts:132-147` (`ensureVapidKeys`), `packages/server/src/routes/push.ts:7-13`, `packages/watcher/src/push.ts:5-39`

**Problem**: VAPID key generation and push subscription JSON file management scattered across 3 files in 2 packages. File paths (`vapid.json`, `push_subscriptions.json`) hardcoded in 3 places. JSON read/write pattern duplicated.

**Deletion test**: Delete the watcher's key loading and it reappears in server (which already has its own copy). Neither truly hides the concern.

**Solution**: Extract `readVapidKeys()`, `readSubscriptions()`, `writeSubscriptions()` into a dedicated module. File paths defined once.

**Benefits**: **Locality** — one place for push storage. Moving from JSON file to SQLite changes one module. **Testability** — subscription management testable independently of HTTP.

---

## Candidate 4: Route Handler Error Wrapping Duplication

**Files**: All 10 files in `packages/server/src/routes/`

**Problem**: Every handler has identical pattern:
```ts
.pipe(Effect.catchAll((e: { message: string }) =>
  Effect.succeed(Response.json({ error: e.message }, { status: XXX }))))
```
15+ copies. Handlers are **shallow** — their interface (which service method, which status code) is nearly as wide as their implementation (one service call + Response.json). Status codes inconsistently assigned.

**Deletion test**: If a handler disappears, the caller needs to know the same service method + status code. Handler isn't hiding anything — it's a pass-through with a status code annotation.

**Solution**: `handlerWrapper` that maps TaggedError types to HTTP status codes by class. `NotFoundError` → 404, `ValidationError` → 422, others → 502. Handlers keep only domain-specific validation.

**Benefits**: **Locality** — error-to-HTTP-status mapping in one place. New error type requires no handler changes. **Leverage** — wrapper absorbs catchAll pattern.

---

## Candidate 5: Watcher ID Generation Is Fragile

**Files**: `packages/watcher/src/index.ts:42`, `packages/server/src/layers/WatchStore.ts:89`

**Problem**: Alert IDs: `Date.now()` + increment. Watcher restart within same ms = collision → silent drop via `INSERT OR IGNORE`. Watch IDs: `let nextWatchId = 1` resets on restart, risking reuse with deleted watches.

**Solution**: Replace both with `crypto.randomUUID()`.

**Benefits**: No silent data loss. No ID collisions. 2-line change per module.

---

## Question for user

Candidate 1 — dedicated `packages/db` package vs. DDL strings in shared. What do you think?
