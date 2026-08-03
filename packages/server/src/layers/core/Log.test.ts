import { Effect } from "effect"
import { layer, expect, vi, beforeEach, afterEach } from "@effect/vitest"
import { LogService, LogServiceLive } from "./Log"

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

layer(LogServiceLive)("LogService", (it) => {
  it.effect("info writes formatted line to stderr (INFO level uses timestamp, not label)", () =>
    Effect.gen(function* () {
      const log = yield* LogService
      yield* log.info("pipeline", "Hello", "World")
      expect(process.stderr.write).toHaveBeenCalledTimes(1)
      const call = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      // INFO level uses dimmed timestamp as level indicator (no "INFO" label)
      expect(call).toContain("pipeline")
      expect(call).toContain("Hello World")
    }))

  it.effect("warn writes formatted line with WARN label to stderr", () =>
    Effect.gen(function* () {
      const log = yield* LogService
      yield* log.warn("config", "Something fishy")
      const call = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(call).toContain("WARN")
      expect(call).toContain("config")
      expect(call).toContain("Something fishy")
    }))

  it.effect("error writes formatted line with ERROR label to stderr", () =>
    Effect.gen(function* () {
      const log = yield* LogService
      yield* log.error("server", "Fatal", "crash")
      const call = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(call).toContain("ERROR")
      expect(call).toContain("server")
      expect(call).toContain("Fatal crash")
    }))

  it.effect("withJob prefixes messages with [job <id>]", () =>
    Effect.gen(function* () {
      const log = yield* LogService
      const jl = log.withJob("42")
      yield* jl.info("jobs", "Started")
      const call = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(call).toContain("[job 42]")
    }))

  it.effect("withJob warn and error also carry prefix", () =>
    Effect.gen(function* () {
      const log = yield* LogService
      const jl = log.withJob("99")
      yield* jl.warn("pipeline", "Slow")
      yield* jl.error("pipeline", "Failed")

      const calls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: unknown[]) => c[0] as string,
      )
      expect(calls[0]).toContain("[job 99]")
      expect(calls[0]).toContain("WARN")
      expect(calls[1]).toContain("[job 99]")
      expect(calls[1]).toContain("ERROR")
    }))

  it.effect("namespace gets ANSI color codes", () =>
    Effect.gen(function* () {
      const log = yield* LogService
      yield* log.info("server", "test")
      const call = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(call).toContain("\x1b[")
      expect(call).toContain("\x1b[0m")
    }))
})
