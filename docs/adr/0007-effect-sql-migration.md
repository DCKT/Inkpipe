# ADR 0007: `@effect/sql` + `@effect/sql-sqlite-bun` Migration

## Context

The project used raw `bun:sqlite` via a `DbService` Effect Tag wrapper (ADR 0002). As of mid-2026, the codebase has grown to 3 database-accessing services (Config, WatchStore, JobStore) each with manual row→domain mapping functions, manual `Effect.try` wrappers, and ad-hoc SQL string construction. The `docs/guides/effect-guide.md` documented `@effect/sql` patterns as the recommended approach, creating a gap between the guide and the code.

## Decision

Migrate from raw `bun:sqlite` to `@effect/sql` + `@effect/sql-sqlite-bun`:

- **`@effect/sql`** provides type-safe SQL queries via `sql` tagged template, `SqlSchema` (findAll, findOne, single, void), `Model` (Class, Generated, DateTimeInsert/Update, BooleanFromNumber, JsonFromString), and `Migrator` (versioned migrations).
- **`@effect/sql-sqlite-bun`** is the first-party Bun SQLite adapter — zero extra native dependencies.
- **CamelCase/snake_case transform** configured in `DbLayer` via `transformQueryNames`/`transformResultNames` — domain types use camelCase, DB columns use snake_case, mapping is automatic.
- **Versioned migrations** via `effect_sql_migrations` table — `0001_initial.sql` creates all tables, migrates config data from old key-value format to per-section typed tables, drops old entity tables.
- **Config restructured** from single key-value JSON blob table to 5 per-section typed tables (`prowlarr_config`, `alldebrid_config`, `kcc_config`, `copyparty_config`, `komga_config`), each with multiple typed columns — no more `JSON.parse`/`JSON.stringify` round-trips.
- **IDs switched** from app-generated strings to DB-generated integers (`INTEGER PRIMARY KEY AUTOINCREMENT`) — eliminates race conditions on ID generation.
- **Tests switch** from Node runtime with `bun:sqlite` mock to Bun runtime with real `:memory:` SQLite — tests actual SQL, no mock maintenance burden.

## Alternatives Considered

- **Stay with raw `bun:sqlite`**: Simpler but losing type safety, verbose, no migration support. Manual mock complexity growing.
- **Drizzle / Kysely**: Good ORMs, but add JavaScript-first tooling. `@effect/sql` integrates natively with Effect Schema and Effect's structured concurrency.
- **`@effect/sql` with `Model.Class`**: Attempted, but faced type system friction (`DateTimeInsert` producing `Utc` not `string`, `Watch.insert`/`.update` static access not resolved). Settled on `Schema.Struct` + manual row types for the first pass — `Model.Class` can be adopted incrementally later.

## Consequences

- **Positive**: Type-safe queries, versioned migrations, no manual `rowToX` mappers in DB layer, tests run against real SQLite, camelCase/snake_case handled automatically.
- **Negative**: Two extra dependencies (`@effect/sql`, `@effect/sql-sqlite-bun`). `Model.Class` not fully adopted yet — domain types remain `Schema.Struct`.
- **Remaining**: Write replacement tests for Config, WatchStore, JobStore services. Adopt `Model.Class` when type system issues are resolved.

## Status

Accepted (2026-06-24)
