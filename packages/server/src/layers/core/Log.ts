import { Context, Effect, Layer } from "effect"

// Read directly (rather than importing from ./Otel) so LogService — depended on
// by virtually every layer, including in tests run under Node/vitest — never
// pulls in Otel.ts's @effect/platform-bun import, which fails to load outside Bun.
const otelEnabled = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT)

// ---------------------------------------------------------------------------
// ANSI helpers (zero-dependency)
// ---------------------------------------------------------------------------

const CSI = "\x1b["
const RESET = `${CSI}0m`
const DIM = `${CSI}2m`

function color(code: number) {
  return (s: string) => `${CSI}${code}m${s}${RESET}`
}

const ansi = {
  red: color(31),
  green: color(32),
  yellow: color(33),
  blue: color(34),
  magenta: color(35),
  cyan: color(36),
  dim: (s: string) => `${DIM}${s}${RESET}`,
}

// ---------------------------------------------------------------------------
// Namespace → color mapping
// ---------------------------------------------------------------------------

const NAMESPACE_COLORS: Record<string, (s: string) => string> = {
  server: ansi.cyan,
  config: ansi.yellow,
  pipeline: ansi.magenta,
  jobs: ansi.green,
  alldebrid: ansi.blue,
  prowlarr: ansi.blue,
  komga: ansi.blue,
  copyparty: ansi.blue,
  kcc: ansi.blue,
  telegram: ansi.blue,
  files: ansi.blue,
  http: ansi.dim,
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class LogService extends Context.Service<
  LogService,
  {
    readonly info: (namespace: string, ...message: unknown[]) => Effect.Effect<void>
    readonly warn: (namespace: string, ...message: unknown[]) => Effect.Effect<void>
    readonly error: (namespace: string, ...message: unknown[]) => Effect.Effect<void>
    /** Returns a logger variant that prepends `[job <id>]` to every message. */
    readonly withJob: (jobId: string) => {
      info: (namespace: string, ...message: unknown[]) => Effect.Effect<void>
      warn: (namespace: string, ...message: unknown[]) => Effect.Effect<void>
      error: (namespace: string, ...message: unknown[]) => Effect.Effect<void>
    }
  }
>()("LogService") {}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function timestamp(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false })
}

function colorFor(namespace: string): (s: string) => string {
  return NAMESPACE_COLORS[namespace] ?? ansi.dim
}

function inspect(m: unknown): string {
  if (typeof m === "string") return m
  if (typeof (globalThis as any).Bun?.inspect === "function") return (globalThis as any).Bun.inspect(m)
  try {
    return JSON.stringify(m)
  } catch {
    return String(m)
  }
}

function format(level: "INFO" | "WARN" | "ERROR", namespace: string, prefix: string, ...message: unknown[]) {
  const ts = ansi.dim(timestamp())
  const ns = colorFor(namespace)(namespace.padEnd(10))
  const levelColors: Record<string, string> = { INFO: ts, WARN: ansi.yellow("WARN "), ERROR: ansi.red("ERROR") }
  const lvl = levelColors[level]
  const body = message.map(inspect).join(" ")
  const maybePrefix = prefix ? `${prefix} ` : ""
  process.stderr.write(`${lvl} ${ts} ${ns} ${maybePrefix}${body}\n`)
}

// ---------------------------------------------------------------------------
// Effect logger bridge (feeds OTLP export — see layers/core/Otel.ts)
// ---------------------------------------------------------------------------

const otelLogFn: Record<"INFO" | "WARN" | "ERROR", (...message: unknown[]) => Effect.Effect<void>> = {
  INFO: Effect.logInfo,
  WARN: Effect.logWarning,
  ERROR: Effect.logError,
}

/** Writes the colored console line (unchanged) and, when OTLP export is
 * configured, also emits through Effect's Logger so the OTLP layer can export
 * it — LogService otherwise never touches Effect.log*, so without this bridge
 * no log line would reach Loki. Gated on `otelEnabled`: Effect's default
 * logger is always active regardless of OTLP, so calling Effect.log*
 * unconditionally would double-print every line to the console even when
 * nothing is exporting. */
function emit(level: "INFO" | "WARN" | "ERROR", namespace: string, jobId: string | undefined, message: unknown[]) {
  const prefix = jobId ? `[job ${jobId}]` : ""
  const consoleEffect = Effect.sync(() => format(level, namespace, prefix, ...message))
  if (!otelEnabled) return consoleEffect
  return Effect.andThen(
    consoleEffect,
    otelLogFn[level](...message).pipe(
      Effect.annotateLogs(jobId ? { namespace, jobId } : { namespace }),
    ),
  )
}

// ---------------------------------------------------------------------------
// Live layer
// ---------------------------------------------------------------------------

export const LogServiceLive = Layer.succeed(LogService, {
  info: (ns, ...msg) => emit("INFO", ns, undefined, msg),
  warn: (ns, ...msg) => emit("WARN", ns, undefined, msg),
  error: (ns, ...msg) => emit("ERROR", ns, undefined, msg),
  withJob: (jobId: string) => ({
    info: (ns, ...msg) => emit("INFO", ns, jobId, msg),
    warn: (ns, ...msg) => emit("WARN", ns, jobId, msg),
    error: (ns, ...msg) => emit("ERROR", ns, jobId, msg),
  }),
})
