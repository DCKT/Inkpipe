import { Effect } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { LogService, LogServiceLive } from "./Log"

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("LogService", () => {
  it("info writes formatted line to stderr (INFO level uses timestamp, not label)", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const log = yield* LogService
        yield* log.info("pipeline", "Hello", "World")
        expect(process.stderr.write).toHaveBeenCalledTimes(1)
        const call = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        // INFO level uses dimmed timestamp as level indicator (no "INFO" label)
        expect(call).toContain("pipeline")
        expect(call).toContain("Hello World")
      }).pipe(Effect.provide(LogServiceLive)),
    )
  })

  it("warn writes formatted line with WARN label to stderr", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const log = yield* LogService
        yield* log.warn("config", "Something fishy")
        const call = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(call).toContain("WARN")
        expect(call).toContain("config")
        expect(call).toContain("Something fishy")
      }).pipe(Effect.provide(LogServiceLive)),
    )
  })

  it("error writes formatted line with ERROR label to stderr", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const log = yield* LogService
        yield* log.error("server", "Fatal", "crash")
        const call = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(call).toContain("ERROR")
        expect(call).toContain("server")
        expect(call).toContain("Fatal crash")
      }).pipe(Effect.provide(LogServiceLive)),
    )
  })

  it("withJob prefixes messages with [job <id>]", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const log = yield* LogService
        const jl = log.withJob("42")
        yield* jl.info("jobs", "Started")
        const call = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(call).toContain("[job 42]")
      }).pipe(Effect.provide(LogServiceLive)),
    )
  })

  it("withJob warn and error also carry prefix", async () => {
    await Effect.runPromise(
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
      }).pipe(Effect.provide(LogServiceLive)),
    )
  })

  it("namespace gets ANSI color codes", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const log = yield* LogService
        yield* log.info("server", "test")
        const call = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
        expect(call).toContain("\x1b[")
        expect(call).toContain("\x1b[0m")
      }).pipe(Effect.provide(LogServiceLive)),
    )
  })
})
