import { Effect, Layer } from "effect"

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
  files: ansi.blue,
  http: ansi.dim,
}

// ---------------------------------------------------------------------------
// Service tag
// ---------------------------------------------------------------------------

export class LogService extends Effect.Tag("LogService")<
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
>() {}

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
// Live layer
// ---------------------------------------------------------------------------

export const LogServiceLive = Layer.succeed(LogService, {
  info: (ns, ...msg) => Effect.sync(() => format("INFO", ns, "", ...msg)),
  warn: (ns, ...msg) => Effect.sync(() => format("WARN", ns, "", ...msg)),
  error: (ns, ...msg) => Effect.sync(() => format("ERROR", ns, "", ...msg)),
  withJob: (jobId: string) => ({
    info: (ns, ...msg) => Effect.sync(() => format("INFO", ns, `[job ${jobId}]`, ...msg)),
    warn: (ns, ...msg) => Effect.sync(() => format("WARN", ns, `[job ${jobId}]`, ...msg)),
    error: (ns, ...msg) => Effect.sync(() => format("ERROR", ns, `[job ${jobId}]`, ...msg)),
  }),
})
