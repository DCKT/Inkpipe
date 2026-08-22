import { Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "@effect/vitest"
import type { Watch } from "@inkpipe/shared"
import { WatchId, WatchAlertId } from "@inkpipe/shared"
import { notifyWatchMatches, type MatchedAlert } from "./WatchNotifier"
import { PushService } from "./Push"
import { TelegramService } from "../integrations/Telegram"
import { ConfigService } from "../core/Config"
import { LogServiceLive } from "../core/Log"

const now = new Date().toISOString()
const watch: Watch = {
  id: WatchId.make(1),
  name: "One Piece",
  enabled: true,
  query: "one piece",
  intervalSeconds: 600,
  filterGroups: [],
  subfolder: null,
  createdAt: now,
  updatedAt: now,
}

function makeAlert(id: number, title = `Match ${id}`, indexer = "Nyaa"): MatchedAlert {
  return { id: WatchAlertId.make(id), title, indexer, seeders: 5 }
}

interface Deps {
  sendNotificationSpy?: ReturnType<typeof vi.fn>
  sendMessageImpl?: (payload: { text: string; replyMarkup?: unknown }) => Effect.Effect<{ messageId: number }, any>
  publicUrl?: string
  loadConfigFails?: boolean
}

function makeLayer(deps: Deps = {}) {
  const sendNotificationSpy = deps.sendNotificationSpy ?? vi.fn(() => Effect.void)

  return Layer.mergeAll(
    LogServiceLive,
    Layer.succeed(PushService, {
      getVapidPublicKey: Effect.succeed(""),
      addSubscription: () => Effect.void,
      removeSubscription: () => Effect.void,
      sendNotification: sendNotificationSpy,
    } as any),
    Layer.succeed(TelegramService, {
      sendMessage: deps.sendMessageImpl ?? (() => Effect.succeed({ messageId: 1 })),
      getUpdates: () => Effect.succeed([]),
      answerCallbackQuery: () => Effect.void,
      editMessageText: () => Effect.void,
    } as any),
    Layer.succeed(ConfigService, {
      loadConfig: deps.loadConfigFails
        ? Effect.fail(new Error("db unavailable") as any)
        : Effect.succeed({ general: { publicUrl: deps.publicUrl ?? "" } } as any),
      saveConfig: () => Effect.void,
    } as any),
  )
}

function run(matchedAlerts: MatchedAlert[], deps: Deps = {}) {
  return notifyWatchMatches(watch, matchedAlerts).pipe(Effect.provide(makeLayer(deps)))
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("notifyWatchMatches", () => {
  it.effect("does nothing when there are no new alerts", () =>
    Effect.gen(function* () {
      const sendNotificationSpy = vi.fn(() => Effect.void)
      const sendMessageImpl = vi.fn(() => Effect.succeed({ messageId: 1 }))

      yield* run([], { sendNotificationSpy, sendMessageImpl })

      expect(sendNotificationSpy).not.toHaveBeenCalled()
      expect(sendMessageImpl).not.toHaveBeenCalled()
    }))

  it.effect("sends a push notification with the watch name and match count", () =>
    Effect.gen(function* () {
      const sendNotificationSpy = vi.fn(() => Effect.void)

      yield* run([makeAlert(1)], { sendNotificationSpy })

      expect(sendNotificationSpy).toHaveBeenCalledWith({
        title: "Watch: One Piece",
        body: "1 new match found",
        tag: "watch-1",
      })
    }))

  it.effect("sends a Save to Magnet button for a watch with no folder assigned", () =>
    Effect.gen(function* () {
      const sendMessageImpl = vi.fn((_payload: { text: string; replyMarkup?: unknown }) => Effect.succeed({ messageId: 1 }))
      const alert = makeAlert(7, "One Piece v01")

      yield* run([alert], { sendMessageImpl })

      expect(sendMessageImpl).toHaveBeenCalledTimes(1)
      const call = sendMessageImpl.mock.calls[0][0] as { text: string; replyMarkup: any }
      expect(call.text).toContain("One Piece v01")
      expect(call.replyMarkup).toEqual({
        inline_keyboard: [[{ text: "💾 Save to Magnet", callback_data: "sm:1:7" }]],
      })
    }))

  it.effect("sends a Download button for a watch with a folder assigned", () =>
    Effect.gen(function* () {
      const sendMessageImpl = vi.fn((_payload: { text: string; replyMarkup?: unknown }) => Effect.succeed({ messageId: 1 }))
      const bookWatch: Watch = { ...watch, subfolder: "manga/one-piece" }
      const alert = makeAlert(7, "One Piece v01")

      yield* notifyWatchMatches(bookWatch, [alert]).pipe(Effect.provide(makeLayer({ sendMessageImpl })))

      expect(sendMessageImpl).toHaveBeenCalledTimes(1)
      const call = sendMessageImpl.mock.calls[0][0] as { text: string; replyMarkup: any }
      expect(call.replyMarkup).toEqual({
        inline_keyboard: [[{ text: "⬇️ Download", callback_data: "dl:1:7" }]],
      })
    }))

  it.effect("escapes HTML metacharacters in the watch name, alert title, and indexer", () =>
    Effect.gen(function* () {
      const sendMessageImpl = vi.fn((_payload: { text: string; replyMarkup?: unknown }) => Effect.succeed({ messageId: 1 }))
      const htmlWatch: Watch = { ...watch, name: "Fate/stay <night> & co" }
      const alert = makeAlert(1, "<script>alert(1)</script>", "A & B")

      yield* notifyWatchMatches(htmlWatch, [alert]).pipe(Effect.provide(makeLayer({ sendMessageImpl })))

      const call = sendMessageImpl.mock.calls[0][0] as { text: string }
      expect(call.text).not.toContain("<night>")
      expect(call.text).not.toContain("<script>")
      expect(call.text).toContain("Fate/stay &lt;night&gt; &amp; co")
      expect(call.text).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
      expect(call.text).toContain("A &amp; B")
      // The literal <b> markup itself must survive unescaped.
      expect(call.text).toContain("<b>Watch: Fate/stay &lt;night&gt; &amp; co</b>")
    }))

  it.effect("adds a separator to only the first message of a batch", () =>
    Effect.gen(function* () {
      const sendMessageImpl = vi.fn((_payload: { text: string; replyMarkup?: unknown }) => Effect.succeed({ messageId: 1 }))
      const alerts = [makeAlert(1), makeAlert(2), makeAlert(3)]

      yield* run(alerts, { sendMessageImpl })

      expect(sendMessageImpl).toHaveBeenCalledTimes(3)
      const texts = sendMessageImpl.mock.calls.map((call) => (call[0] as { text: string }).text)
      expect(texts[0]).toMatch(/^➖+\n<b>Watch:/)
      expect(texts[1]).not.toMatch(/^➖/)
      expect(texts[2]).not.toMatch(/^➖/)
    }))

  it.effect("caps per-alert Telegram messages at 5 and adds a summary for the rest", () =>
    Effect.gen(function* () {
      const sendMessageImpl = vi.fn((_payload: { text: string; replyMarkup?: unknown }) => Effect.succeed({ messageId: 1 }))
      const alerts = Array.from({ length: 7 }, (_, i) => makeAlert(i + 1))

      yield* run(alerts, { sendMessageImpl })

      // 5 per-alert messages + 1 summary message
      expect(sendMessageImpl).toHaveBeenCalledTimes(6)
      const firstCall = sendMessageImpl.mock.calls[0][0] as { text: string }
      expect(firstCall.text).toMatch(/^➖/)
      const summaryCall = sendMessageImpl.mock.calls[5][0] as { text: string; replyMarkup?: unknown }
      expect(summaryCall.text).not.toMatch(/^➖/)
      expect(summaryCall.text).toContain("+2 more")
      expect(summaryCall.replyMarkup).toBeUndefined()
    }))

  it.effect("links the summary message to the watch's detail page when a public URL is configured", () =>
    Effect.gen(function* () {
      const sendMessageImpl = vi.fn((_payload: { text: string; replyMarkup?: unknown }) => Effect.succeed({ messageId: 1 }))
      const alerts = Array.from({ length: 7 }, (_, i) => makeAlert(i + 1))

      yield* run(alerts, { sendMessageImpl, publicUrl: "https://inkpipe.example.com" })

      const summaryCall = sendMessageImpl.mock.calls[5][0] as { text: string }
      expect(summaryCall.text).toContain('<a href="https://inkpipe.example.com/watches/1">see the web UI</a>')
    }))

  it.effect("strips a trailing slash from the configured public URL when building the link", () =>
    Effect.gen(function* () {
      const sendMessageImpl = vi.fn((_payload: { text: string; replyMarkup?: unknown }) => Effect.succeed({ messageId: 1 }))
      const alerts = Array.from({ length: 7 }, (_, i) => makeAlert(i + 1))

      yield* run(alerts, { sendMessageImpl, publicUrl: "https://inkpipe.example.com/" })

      const summaryCall = sendMessageImpl.mock.calls[5][0] as { text: string }
      expect(summaryCall.text).toContain('<a href="https://inkpipe.example.com/watches/1">see the web UI</a>')
    }))

  it.effect("falls back to plain text in the summary message when no public URL is configured", () =>
    Effect.gen(function* () {
      const sendMessageImpl = vi.fn((_payload: { text: string; replyMarkup?: unknown }) => Effect.succeed({ messageId: 1 }))
      const alerts = Array.from({ length: 7 }, (_, i) => makeAlert(i + 1))

      yield* run(alerts, { sendMessageImpl })

      const summaryCall = sendMessageImpl.mock.calls[5][0] as { text: string }
      expect(summaryCall.text).toContain("— see the web UI")
      expect(summaryCall.text).not.toContain("<a href=")
    }))

  it.effect("still sends the summary message (as plain text) when loading config for the link fails", () =>
    Effect.gen(function* () {
      const sendMessageImpl = vi.fn((_payload: { text: string; replyMarkup?: unknown }) => Effect.succeed({ messageId: 1 }))
      const alerts = Array.from({ length: 7 }, (_, i) => makeAlert(i + 1))

      yield* run(alerts, { sendMessageImpl, loadConfigFails: true })

      // All 5 per-alert messages plus the summary must still go out — a
      // config-load hiccup should only cost the link, never the notification.
      expect(sendMessageImpl).toHaveBeenCalledTimes(6)
      const summaryCall = sendMessageImpl.mock.calls[5][0] as { text: string }
      expect(summaryCall.text).toContain("— see the web UI")
      expect(summaryCall.text).not.toContain("<a href=")
    }))

  it.effect("does not send a summary message when there are 5 or fewer new alerts", () =>
    Effect.gen(function* () {
      const sendMessageImpl = vi.fn(() => Effect.succeed({ messageId: 1 }))
      const alerts = Array.from({ length: 5 }, (_, i) => makeAlert(i + 1))

      yield* run(alerts, { sendMessageImpl })

      expect(sendMessageImpl).toHaveBeenCalledTimes(5)
    }))

  it.effect("a failed Telegram send does not prevent the remaining sends", () =>
    Effect.gen(function* () {
      let calls = 0
      const sendMessageImpl = vi.fn(() => {
        calls++
        return calls === 1 ? Effect.fail(new Error("boom") as any) : Effect.succeed({ messageId: 1 })
      })
      const alerts = [makeAlert(1), makeAlert(2)]

      yield* run(alerts, { sendMessageImpl })

      expect(sendMessageImpl).toHaveBeenCalledTimes(2)
    }))
})
