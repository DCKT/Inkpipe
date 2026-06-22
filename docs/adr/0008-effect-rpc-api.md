# Effect/RPC for API coupling

Replace hand-rolled Bun.serve routes + manual `Response.json()` with Effect/RPC. Each RPC endpoint carries typed payload, success, and error schemas — the wire protocol auto-validates and auto-encodes. The frontend imports the same RPC group and uses `RpcClient` (Effect-based) for end-to-end typed calls with `Effect.catchTag`-able errors instead of string-flattened `{ error: string }`.

Bun.serve stays as the outer HTTP layer (static files, CORS, multipart file upload for convert). The RPC handler mounts at `POST /api/rpc` via `RpcServer.toWebHandler()`. Serialization is NDJSON (newline-delimited JSON).

Migration is incremental: one domain group at a time (Settings → Search → Jobs → Push → Copyparty → Komga → Download → Watches). Old route handlers and if/else blocks removed after each group.

**Status:** Accepted

## Considered options

- **Effect HttpApi (api-guide.md pattern):** Documented but not vendored, not a dependency, pattern not verified against codebase. More of a REST-style approach vs RPC's "typed procedure" model.
- **tRPC:** Requires Node.js server, no Effect integration, different type system. Would force a complete framework change.
- **Staying with current approach:** Adding validation at route boundary would reduce pain but doesn't solve end-to-end type safety or typed errors.

## Consequences

- `@effect/rpc` added to all three packages (shared, server, web)
- Frontend now uses Effect runtime (Effect was already a dependency; now actively used)
- `shared/src/api.ts` schemas become redundant, gradually replaced by RPC definitions in `shared/src/rpc/`
- Bun.serve if/else chain shrinks from ~140 lines to ~20
- Typed errors replace `catchAll` → `{ error: string }` everywhere
