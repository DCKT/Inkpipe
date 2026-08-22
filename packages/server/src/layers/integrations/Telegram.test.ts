import { Effect, Layer } from "effect"
import { describe, expect, it, layer, vi, beforeEach, afterEach } from "@effect/vitest"
import type { AppConfig } from "@inkpipe/shared"
import { TelegramService, TelegramServiceLive, escapeHtml } from "./Telegram"
import { ConfigService } from "../core/Config"
import { LogServiceLive } from "../core/Log"

const testConfig: AppConfig = {
  prowlarr: { url: "", apiKey: "" },
  alldebrid: { apiKey: "" },
  kcc: {
    dockerImage: "ghcr.io/ciromattia/kcc:latest", profile: "KoBO", format: "Auto",
    mangaStyle: false, webtoon: false, twoPanel: false,
    upscale: true, stretch: false, hq: false, gamma: 1.0,
    cropping: "1", croppingPower: 1.0, forceColor: true,
    forcePng: false, noAutoContrast: false, blackBorders: false,
    whiteBorders: false, splitter: "0", noProcessing: false,
    eraseRainbow: true, coverFill: false, batchSplit: "0",
    targetSize: 0, customWidth: 0, customHeight: 0, noKepub: false,
  },
  copyparty: { url: "", uploadPath: "/", password: "" },
  komga: { url: "", apiKey: "", defaultLibraryId: "" },
  annasArchive: { apiKey: "", baseUrl: "https://annas-archive.org" },
  telegram: { botToken: "test-token", chatId: "12345" },
  general: { publicUrl: "" },
}

function makeConfigLayer(config?: Partial<AppConfig>) {
  return Layer.succeed(ConfigService, {
    loadConfig: Effect.succeed({ ...testConfig, ...config }),
    saveConfig: () => Effect.void,
  })
}

const TestLayer = Layer.provide(
  TelegramServiceLive,
  Layer.merge(LogServiceLive, makeConfigLayer()),
)

const NotConfiguredLayer = Layer.provide(
  // `TelegramServiceLive` also appears in `TestLayer` above, and both are used
  // within the same `layer()` block's shared MemoMap — without `Layer.fresh`
  // the second build would reuse the already-memoized instance (built with
  // `TestLayer`'s config) instead of picking up this test's empty config.
  Layer.fresh(TelegramServiceLive),
  Layer.merge(
    LogServiceLive,
    makeConfigLayer({ telegram: { botToken: "", chatId: "" } }),
  ),
)

function mockOk(result: unknown) {
  ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify({ ok: true, result }),
    json: async () => ({ ok: true, result }),
  })
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  ;(globalThis as any).fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

layer(TestLayer)("TelegramService", (it) => {
  describe("sendMessage", () => {
    it.effect("sends a message via the Telegram Bot API and returns its message id", () =>
      Effect.gen(function* () {
        mockOk({ message_id: 42 })

        const svc = yield* TelegramService
        const result = yield* svc.sendMessage({ text: "hello" })

        expect(globalThis.fetch).toHaveBeenCalledTimes(1)
        expect(result).toEqual({ messageId: 42 })
      }))

    it.effect("calls the correct Telegram API URL and request shape", () =>
      Effect.gen(function* () {
        mockOk({ message_id: 1 })

        const svc = yield* TelegramService
        yield* svc.sendMessage({ text: "hello" })

        const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>
        const url = fetchMock.mock.calls[0][0] as string
        const init = fetchMock.mock.calls[0][1] as RequestInit
        expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage")
        expect(init.method).toBe("POST")
        expect(JSON.parse(init.body as string)).toEqual({
          chat_id: "12345",
          text: "hello",
          parse_mode: "HTML",
        })
      }))

    it.effect("fails with TelegramHttpError when the response is missing message_id", () =>
      Effect.gen(function* () {
        mockOk({})

        const svc = yield* TelegramService
        const error = yield* Effect.flip(svc.sendMessage({ text: "hello" }))

        expect(error.message).toContain("message_id")
      }))

    it.effect("includes reply_markup when a replyMarkup is provided", () =>
      Effect.gen(function* () {
        mockOk({ message_id: 1 })
        const replyMarkup = { inline_keyboard: [[{ text: "⬇️ Download", callback_data: "dl:1:2" }]] }

        const svc = yield* TelegramService
        yield* svc.sendMessage({ text: "hello", replyMarkup })

        const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>
        const init = fetchMock.mock.calls[0][1] as RequestInit
        expect(JSON.parse(init.body as string)).toEqual({
          chat_id: "12345",
          text: "hello",
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        })
      }))
  })

  describe("getUpdates", () => {
    it.effect("calls the correct URL and returns the result array", () =>
      Effect.gen(function* () {
        const update = { update_id: 5, callback_query: { id: "cb1", data: "dl:1:2", from: { id: 999 }, message: { message_id: 42, chat: { id: 12345 } } } }
        mockOk([update])

        const svc = yield* TelegramService
        const updates = yield* svc.getUpdates(3, 25)

        expect(updates).toEqual([update])
        const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>
        const url = fetchMock.mock.calls[0][0] as string
        const init = fetchMock.mock.calls[0][1] as RequestInit
        expect(url).toBe("https://api.telegram.org/bottest-token/getUpdates")
        expect(JSON.parse(init.body as string)).toEqual({
          offset: 3,
          timeout: 25,
          allowed_updates: ["callback_query"],
        })
      }))

    it.effect("returns an empty array when Telegram returns no result", () =>
      Effect.gen(function* () {
        mockOk(undefined)

        const svc = yield* TelegramService
        const updates = yield* svc.getUpdates(0, 25)

        expect(updates).toEqual([])
      }))
  })

  describe("answerCallbackQuery", () => {
    it.effect("calls the correct URL with the callback query id and optional text", () =>
      Effect.gen(function* () {
        mockOk(true)

        const svc = yield* TelegramService
        yield* svc.answerCallbackQuery("cb1", "Download started")

        const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>
        const url = fetchMock.mock.calls[0][0] as string
        const init = fetchMock.mock.calls[0][1] as RequestInit
        expect(url).toBe("https://api.telegram.org/bottest-token/answerCallbackQuery")
        expect(JSON.parse(init.body as string)).toEqual({
          callback_query_id: "cb1",
          text: "Download started",
        })
      }))

    it.effect("omits text when not provided", () =>
      Effect.gen(function* () {
        mockOk(true)

        const svc = yield* TelegramService
        yield* svc.answerCallbackQuery("cb1")

        const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>
        const init = fetchMock.mock.calls[0][1] as RequestInit
        expect(JSON.parse(init.body as string)).toEqual({ callback_query_id: "cb1" })
      }))
  })

  describe("editMessageText", () => {
    it.effect("calls the correct URL with the configured chat id and message id", () =>
      Effect.gen(function* () {
        mockOk({ message_id: 42 })

        const svc = yield* TelegramService
        yield* svc.editMessageText(42, "updated text")

        const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>
        const url = fetchMock.mock.calls[0][0] as string
        const init = fetchMock.mock.calls[0][1] as RequestInit
        expect(url).toBe("https://api.telegram.org/bottest-token/editMessageText")
        expect(JSON.parse(init.body as string)).toEqual({
          chat_id: "12345",
          message_id: 42,
          text: "updated text",
          parse_mode: "HTML",
        })
      }))

    it.effect("includes reply_markup when provided (used to keep or replace buttons)", () =>
      Effect.gen(function* () {
        mockOk({ message_id: 42 })
        const replyMarkup = { inline_keyboard: [[{ text: "Retry", callback_data: "dl:1:2" }]] }

        const svc = yield* TelegramService
        yield* svc.editMessageText(42, "updated text", replyMarkup)

        const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>
        const init = fetchMock.mock.calls[0][1] as RequestInit
        expect(JSON.parse(init.body as string)).toEqual({
          chat_id: "12345",
          message_id: 42,
          text: "updated text",
          parse_mode: "HTML",
          reply_markup: replyMarkup,
        })
      }))
  })

  describe("error handling", () => {
    it.effect("fails with TelegramNotConfigured when config is missing", () =>
      Effect.gen(function* () {
        const svc = yield* TelegramService
        const error = yield* Effect.flip(svc.sendMessage({ text: "hello" }))

        expect(error.message).toBe("Telegram is not configured")
      }).pipe(Effect.provide(NotConfiguredLayer)))

    it.effect("fails with TelegramHttpError on network failure", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNREFUSED"))

        const svc = yield* TelegramService
        const error = yield* Effect.flip(svc.sendMessage({ text: "hello" }))

        expect(error.message).toContain("ECONNREFUSED")
      }))

    it.effect("fails with TelegramHttpError on non-OK response", () =>
      Effect.gen(function* () {
        ;((globalThis as any).fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
          ok: false,
          status: 400,
          text: async () => "Bad Request: chat not found",
        })

        const svc = yield* TelegramService
        const error = yield* Effect.flip(svc.sendMessage({ text: "hello" }))

        expect(error.message).toContain("400")
      }))
  })
})

describe("escapeHtml", () => {
  it("escapes &, <, >, and \" in that order", () => {
    expect(escapeHtml('<b>a & "b"</b>')).toBe("&lt;b&gt;a &amp; &quot;b&quot;&lt;/b&gt;")
  })

  it("leaves plain text unchanged", () => {
    expect(escapeHtml("One Piece v01")).toBe("One Piece v01")
  })

  it("escapes double quotes so the result is safe inside an HTML attribute value", () => {
    const malicious = 'https://x.com/a?b=1&c="z"'
    const escaped = escapeHtml(malicious)
    expect(escaped).toBe("https://x.com/a?b=1&amp;c=&quot;z&quot;")
    // The whole point of escaping quotes: no raw `"` can survive to end up
    // inside an href="..." attribute and terminate it early.
    expect(escaped).not.toContain('"')
  })
})
