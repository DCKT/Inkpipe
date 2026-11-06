import { Dialog } from "@foldkit/ui"
import { Duration, Effect, Fiber, Layer, Option, Ref, Stream } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { TestClock } from "effect/testing"
import { Command, given, message, model, story } from "foldkit/story"
import { describe, expect, test } from "vitest"

import { ApiClientService } from "./api"
import * as Jobs from "./jobs"
import { makeJob } from "./jobsFixtures"

const base = Jobs.init().model
const job = makeJob({ id: 1 })

describe("init", () => {
  test("starts empty and closed, and fetches the list once", () => {
    const { model: initial, commands } = Jobs.init()
    expect(initial.jobs).toStrictEqual([])
    expect(initial.drawer.isOpen).toBe(false)
    expect(commands?.map((c) => c.name)).toStrictEqual(["FetchJobs"])
  })
})

describe("update: data", () => {
  test("socket events are applied to the list", () => {
    story(
      Jobs.update,
      given(base),
      message(Jobs.Message.ReceivedSocketEvent({ event: { type: "init", jobs: [job] } })),
      message(
        Jobs.Message.ReceivedSocketEvent({ event: { type: "update", job: makeJob({ id: 2 }) } }),
      ),
      model((m) => {
        expect(m.jobs.map((j) => j.id)).toStrictEqual([2, 1])
      }),
    )
  })

  test("a poll tick re-fetches; a failed fetch keeps the list; a good one replaces it", () => {
    story(
      Jobs.update,
      given({ ...base, jobs: [job] }),
      message(Jobs.Message.TickedPoll()),
      Command.expectHas(Jobs.FetchJobs({ epoch: 0 })),
      Command.resolve(
        Jobs.FetchJobs,
        Jobs.Message.CompletedFetchJobs({ epoch: 0, maybeJobs: Option.none() }),
      ),
      model((m) => {
        expect(m.jobs).toStrictEqual([job])
      }),
      message(Jobs.Message.CompletedFetchJobs({ epoch: 0, maybeJobs: Option.some([]) })),
      model((m) => {
        expect(m.jobs).toStrictEqual([])
      }),
    )
  })

  test("a poll that began before a newer socket frame cannot clobber it", () => {
    const polling = Jobs.update({ ...base, jobs: [job] }, Jobs.Message.TickedPoll())
    expect(polling.commands?.map((c) => c.name)).toStrictEqual(["FetchJobs"])
    // the job finishes over the socket while the GET is still in flight…
    const afterFrame = Jobs.update(
      polling.model,
      Jobs.Message.ReceivedSocketEvent({
        event: { type: "update", job: makeJob({ id: 1, stage: "DONE", progress: 100 }) },
      }),
    ).model
    // …then the stale response (job still downloading) lands.
    const afterStale = Jobs.update(
      afterFrame,
      Jobs.Message.CompletedFetchJobs({ epoch: 0, maybeJobs: Option.some([job]) }),
    ).model
    expect(afterStale.jobs[0]?.stage).toBe("DONE")
    expect(afterStale.socketEpoch).toBe(1)
  })

  test("a poll that started after the latest frame is applied, and polls carry the current epoch", () => {
    const afterFrame = Jobs.update(
      base,
      Jobs.Message.ReceivedSocketEvent({ event: { type: "init", jobs: [] } }),
    ).model
    const tick = Jobs.update(afterFrame, Jobs.Message.TickedPoll())
    expect(tick.commands?.[0]?.args).toStrictEqual({ epoch: 1 })
    const applied = Jobs.update(
      afterFrame,
      Jobs.Message.CompletedFetchJobs({ epoch: 1, maybeJobs: Option.some([job]) }),
    ).model
    expect(applied.jobs).toStrictEqual([job])
  })

  test("the clock tick stores the time", () => {
    story(
      Jobs.update,
      given(base),
      message(Jobs.Message.TickedClock({ nowMillis: 42 })),
      model((m) => {
        expect(m.nowMillis).toBe(42)
      }),
    )
  })
})

describe("update: clearing", () => {
  test("Clean asks for confirmation first, and Keep backs out without a request", () => {
    story(
      Jobs.update,
      given(base),
      message(Jobs.Message.ClickedClean()),
      // Focus moves onto the confirmation so it is never left on a removed node.
      Command.expectHas(Jobs.FocusConfirmClean()),
      Command.resolve(Jobs.FocusConfirmClean, Jobs.Message.CompletedFocus()),
      model((m) => {
        expect(m.isConfirmingClear).toBe(true)
        expect(m.isClearing).toBe(false)
      }),
      message(Jobs.Message.ClickedCancelClean()),
      Command.expectHas(Jobs.FocusClean()),
      Command.resolve(Jobs.FocusClean, Jobs.Message.CompletedFocus()),
      model((m) => {
        expect(m.isConfirmingClear).toBe(false)
      }),
    )
  })

  test("confirming sends exactly one ClearJobs, and a second confirm while clearing is ignored", () => {
    story(
      Jobs.update,
      given({ ...base, isConfirmingClear: true }),
      message(Jobs.Message.ClickedConfirmClean()),
      Command.expectHas(Jobs.ClearJobs()),
      Command.resolve(Jobs.FocusClean, Jobs.Message.CompletedFocus()),
      model((m) => {
        expect(m.isClearing).toBe(true)
        expect(m.isConfirmingClear).toBe(false)
      }),
      Command.resolve(Jobs.ClearJobs, Jobs.Message.SucceededClearJobs({ deleted: 3 })),
      Command.resolve(
        Jobs.FetchJobs,
        Jobs.Message.CompletedFetchJobs({ epoch: 0, maybeJobs: Option.some([]) }),
      ),
      model((m) => {
        expect(m.isClearing).toBe(false)
        expect(m.maybeClearStatus).toStrictEqual(
          Option.some({ kind: "success", text: "Cleared 3 completed jobs" }),
        )
      }),
    )
    const clearing = { ...base, isClearing: true }
    const again = Jobs.update(clearing, Jobs.Message.ClickedConfirmClean())
    expect(again.commands ?? []).toHaveLength(0)
  })

  test("singular wording for one job", () => {
    const { model: m } = Jobs.update(base, Jobs.Message.SucceededClearJobs({ deleted: 1 }))
    expect(m.maybeClearStatus).toStrictEqual(
      Option.some({ kind: "success", text: "Cleared 1 completed job" }),
    )
  })

  test("a failure is reported in the drawer and re-enables Clean", () => {
    const { model: m } = Jobs.update(
      { ...base, isClearing: true },
      Jobs.Message.FailedClearJobs({ reason: "boom" }),
    )
    expect(m.isClearing).toBe(false)
    expect(m.maybeClearStatus).toStrictEqual(
      Option.some({ kind: "error", text: "Failed to clear jobs: boom" }),
    )
  })
})

describe("update: drawer", () => {
  test("toggling opens, then closes, and resets any pending confirmation", () => {
    const stale = {
      ...base,
      isConfirmingClear: true,
      maybeClearStatus: Option.some({ kind: "error" as const, text: "old" }),
    }
    const opened = Jobs.update(stale, Jobs.Message.ClickedToggleDrawer()).model
    expect(opened.drawer.isOpen).toBe(true)
    expect(opened.isConfirmingClear).toBe(false)
    expect(opened.maybeClearStatus).toStrictEqual(Option.none())
    const closed = Jobs.update(opened, Jobs.Message.ClickedToggleDrawer()).model
    expect(closed.drawer.isOpen).toBe(false)
  })

  test("opening the drawer is not blocked by Dialog commands", () => {
    story(
      Jobs.update,
      given(base),
      message(Jobs.Message.ClickedToggleDrawer()),
      Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
    )
  })
})

// A hand-rolled socket: just enough surface for socketStream.
class FakeSocket extends EventTarget {
  static readonly instances: Array<FakeSocket> = []
  closed = false
  constructor(readonly url: string) {
    super()
    FakeSocket.instances.push(this)
  }
  receive(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }))
  }
  drop() {
    this.dispatchEvent(new Event("close"))
  }
  close() {
    this.closed = true
  }
}
const openFake = (url: string): Jobs.SocketLike => new FakeSocket(url)

describe("socketStream", () => {
  const frame = (value: unknown) => JSON.stringify(value)

  test("emits decoded frames, ignores junk, and ends when the socket closes", async () => {
    FakeSocket.instances.length = 0
    const received = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Stream.runCollect(
          Jobs.socketStream("ws://x/api/jobs/ws", openFake),
        ).pipe(Effect.forkChild)
        yield* Effect.yieldNow
        const socket = FakeSocket.instances[0]
        socket?.receive(frame({ type: "init", jobs: [job] }))
        socket?.receive("garbage")
        socket?.receive(frame({ type: "update", job: makeJob({ id: 9 }) }))
        socket?.drop()
        const messages = yield* Fiber.await(fiber)
        return { messages, closed: socket?.closed, url: socket?.url }
      }).pipe(Effect.scoped),
    )

    expect(received.url).toBe("ws://x/api/jobs/ws")
    expect(received.closed).toBe(true)
    expect(received.messages._tag).toBe("Success")
    if (received.messages._tag === "Success") {
      expect(received.messages.value.map((m) => m._tag)).toStrictEqual([
        "ReceivedSocketEvent",
        "ReceivedSocketEvent",
      ])
    }
  })

  test("reconnects 3s after a drop, and closes the live socket when interrupted", async () => {
    FakeSocket.instances.length = 0
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const count = yield* Ref.make(0)
        const fiber = yield* Jobs.reconnectingSocketStream("ws://x", openFake).pipe(
          Stream.runForEach(() => Ref.update(count, (n) => n + 1)),
          Effect.forkChild,
        )
        yield* Effect.yieldNow
        const first = FakeSocket.instances[0]
        first?.drop()
        yield* Effect.yieldNow
        yield* TestClock.adjust(Duration.millis(2999))
        const beforeReconnect = FakeSocket.instances.length
        yield* TestClock.adjust(Duration.millis(1))
        yield* Effect.yieldNow
        const afterReconnect = FakeSocket.instances.length
        yield* Fiber.interrupt(fiber)
        yield* Effect.yieldNow
        return { beforeReconnect, afterReconnect, lastClosed: FakeSocket.instances.at(-1)?.closed }
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    )

    expect(result.beforeReconnect).toBe(1)
    expect(result.afterReconnect).toBe(2)
    expect(result.lastClosed).toBe(true)
  })
})

describe("socket URL", () => {
  test("is the server's jobs socket path on the configured ws base", () => {
    expect(Jobs.jobsSocketUrl("ws://localhost:3000")).toBe("ws://localhost:3000/api/jobs/ws")
    expect(Jobs.jobsSocketUrl("wss://inkpipe.example")).toBe("wss://inkpipe.example/api/jobs/ws")
  })
})

describe("poll subscription", () => {
  test("nothing at t=0 (init already fetched), then one tick per 15s", async () => {
    const counts = await Effect.runPromise(
      Effect.gen(function* () {
        const ticks = yield* Ref.make(0)
        yield* Jobs.subscriptions.poll.dependenciesToStream({}).pipe(
          Stream.runForEach(() => Ref.update(ticks, (n) => n + 1)),
          Effect.forkScoped,
        )
        yield* TestClock.adjust(Duration.seconds(14))
        const before = yield* Ref.get(ticks)
        yield* TestClock.adjust(Duration.seconds(1))
        const first = yield* Ref.get(ticks)
        yield* TestClock.adjust(Duration.seconds(15))
        const second = yield* Ref.get(ticks)
        return [before, first, second]
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    )
    expect(counts).toStrictEqual([0, 1, 2])
  })
})

describe("clock subscription", () => {
  const clock = Jobs.subscriptions.clock

  test("only ticks while the drawer is open", async () => {
    const run = (isDrawerOpen: boolean) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const ticks = yield* Ref.make(0)
          yield* clock.dependenciesToStream({ isDrawerOpen }).pipe(
            Stream.runForEach(() => Ref.update(ticks, (n) => n + 1)),
            Effect.forkScoped,
          )
          yield* TestClock.adjust(Duration.seconds(3))
          return yield* Ref.get(ticks)
        }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
      )

    expect(await run(false)).toBe(0)
    expect(await run(true)).toBeGreaterThanOrEqual(3)
  })
})

describe("Commands (against a stubbed API)", () => {
  const run = <A>(
    command: { readonly effect: Effect.Effect<A, never, ApiClientService> },
    respond: () => Response,
  ) => {
    const httpClient = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, respond()))),
    )
    const layer = ApiClientService.layer("http://api.test").pipe(Layer.provide(httpClient))
    return Effect.runPromise(command.effect.pipe(Effect.provide(layer)))
  }
  const json = (status: number, body: unknown) => () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

  test("FetchJobs: success carries the jobs, failure carries none", async () => {
    expect(await run(Jobs.FetchJobs({ epoch: 0 }), json(200, { jobs: [job] }))).toStrictEqual(
      Jobs.Message.CompletedFetchJobs({ epoch: 0, maybeJobs: Option.some([job]) }),
    )
    expect(await run(Jobs.FetchJobs({ epoch: 0 }), json(500, { message: "x" }))).toStrictEqual(
      Jobs.Message.CompletedFetchJobs({ epoch: 0, maybeJobs: Option.none() }),
    )
  })

  test("ClearJobs: success reports the count, failure the server's message", async () => {
    expect(await run(Jobs.ClearJobs(), json(200, { deleted: 4 }))).toStrictEqual(
      Jobs.Message.SucceededClearJobs({ deleted: 4 }),
    )
    const failed = await run(
      Jobs.ClearJobs(),
      json(500, { _tag: "WatchStoreError", message: "db down" }),
    )
    expect(failed._tag).toBe("FailedClearJobs")
  })
})
