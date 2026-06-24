# ADR 0008: Branded ID types

## Context

IDs were typed as plain `number` throughout the codebase. This meant that a `Watch["id"]`, `WatchAlert["watchId"]`, and `Job["id"]` were all interchangeable `number` values, providing no compile-time protection against passing the wrong ID to a function or mixing up entity IDs in query parameters.

## Decision

Use Effect Schema branded types (`Schema.Int.pipe(Schema.brand(...))`) for all domain entity IDs:

- `WatchId` — `Schema.Int.pipe(Schema.brand("WatchId"))`
- `WatchAlertId` — `Schema.Int.pipe(Schema.brand("WatchAlertId"))`
- `JobId` — `Schema.Int.pipe(Schema.brand("JobId"))`

Branded types are structurally equivalent to `number` at runtime but produce a distinct TypeScript type. `Schema.make()` validates at runtime (integer check + brand assertion) and `Schema.decodeUnknown` handles deserialization from wire formats.

Usage across layers:

- **Shared schemas**: `WatchSchema.id` is `WatchId`, `WatchAlertSchema.watchId` is `WatchId`, etc.
- **Service layers**: Method signatures take branded IDs. Row mappers construct them via `WatchId.make(row.id)`.
- **Route handlers**: Parse string URL params to `number`, then `WatchId.make(Number(id))`.
- **Watcher**: IDs flow through as branded types from service responses — no explicit construction needed.
- **Frontend**: Types flow through automatically since the frontend re-exports shared types. Brands are transparent at the JSON level (encode as `number`).

## Alternatives considered

- **Keep plain `number`**: No type safety between ID types. Already led to confusion in tests (string vs number params).
- **UUID/string IDs**: Unnecessary for a local SQLite app. Integer IDs are simpler and faster for AUTOINCREMENT.

## Consequences

- **Positive**: Compile-time protection against mixing entity IDs. Runtime validation via `Schema.make`. Self-documenting function signatures.
- **Negative**: Slight verbosity in route handlers (`WatchId.make(Number(id))` vs `Number(id)`). Brands can be bypassed with `as any` casts (but existing lint rules prohibit `any`).
- **Remaining**: `KomgaLibrary.id`, `KomgaSeries.id`, `KomgaBook.id` remain `string` — these are external IDs from the Komga API, not our DB.

## Status

Accepted (2026-06-24)
