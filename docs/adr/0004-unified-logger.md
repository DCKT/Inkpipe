# ADR 0004: Unified Logger with Namespaced Output

## Context

All server-side logging uses raw `console.log` / `console.error` with ad-hoc
`[prefix]` conventions (e.g. `[pipeline]`, `[server]`, `[alldebrid]`).  This
makes log output hard to scan and impossible to filter by subsystem.

Two specific readability needs emerged:

- **colors** – distinguish log levels and service names visually
- **jobs** – correlate logs to a specific pipeline job (currently manual
  `[pipeline] [job X]` concatenation)

## Decision

Introduce a `LogService` behind an `Effect.Tag` that wraps `console` with
ANSI color output and structured namespace support.

```typescript
class LogService extends Effect.Tag("LogService")<
  LogService,
  {
    readonly info: (namespace: string, ...message: unknown[]) => Effect.Effect<void>
    readonly warn: (namespace: string, ...message: unknown[]) => Effect.Effect<void>
    readonly error: (namespace: string, ...message: unknown[]) => Effect.Effect<void>
    readonly withJob: (jobId: string) => (namespace: string, ...message: unknown[]) => Effect.Effect<void>
  }
>()
```

### Namespace color map

| Namespace    | Color   | Used by |
|-------------|---------|---------|
| `server`    | cyan    | main.ts lifecycle |
| `config`    | yellow  | Config |
| `pipeline`  | magenta | Pipeline |
| `jobs`      | green   | Pipeline per-job logs |
| `alldebrid` | blue    | AllDebrid |
| `prowlarr`  | blue    | Prowlarr |
| `komga`     | blue    | Komga |
| `copyparty` | blue    | Copyparty |
| `kcc`       | blue    | Kcc |
| `files`     | blue    | FileManager |
| `http`      | dim     | Request/response |

`withJob` prepends `[job ${jobId}]` automatically so callers don't
concatenate it by hand.

### Output format

```
 HH:MM:SS  NAMESPACE  [job X] message
```

- Timestamps are dimmed gray
- Namespace is colored per the map above
- Error-level logs use red text

### Implementation

- ANSI escape codes only — no dependency (Bun/Docker-friendly, zero deps)
- `LogServiceLive` is a zero-dependency `Layer.succeed` (no IO, safe as a
  leaf service)
- Existing services that depend on `LogService` receive it via
  `Layer.provide` (see ADR 0002 for the dependency injection pattern)

## Alternatives considered

- **Effect's built-in `Logger` / `Effect.log`**: These route through
  `Effect.logWithLevel` and `FiberRef` which adds indirection. Our log volume
  is low (< 50 lines/minute) and the structured namespace approach is simpler.
- **`pino` / structured JSON logging**: Overkill for a local-network app.
  Human-readable colored output is the primary goal.
- **`chalk` / `picocolors`**: Adds a dependency for ~10 color codes. ANSI
  escape sequences inlined in the logger are sufficient.

## Consequences

- `console.log` calls are replaced by `yield* LogService.info(namespace, ...)`
  in all effectful code.
- `main.ts` and other non-effectful entry points use a synchronous escape
  hatch: `Effect.runSync(LogService.info(...))` after providing the layer.
- Log output becomes consistently formatted and filterable with `grep` by
  namespace or job ID.

## Status

Accepted (2026-06-13)
