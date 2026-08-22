import { Context, Effect, Layer } from "effect"
import { TelegramNotConfigured, TelegramHttpError } from "@inkpipe/shared"
import { ConfigService, requireConfigured } from "../core/Config"
import { LogService } from "../core/Log"

/**
 * Escapes text for use inside a Telegram `parse_mode: "HTML"` message —
 * safe for both text nodes and (since `"` is also escaped) attribute values
 * like `href="..."`. Callers must apply this to any interpolated value
 * (watch names, release titles, a configured public URL, etc.) before
 * wrapping it in HTML — Telegram rejects the entire message if it contains
 * unescaped `<`, `>`, or `&`, and an unescaped `"` inside an attribute value
 * terminates it early, corrupting the surrounding markup.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export interface TelegramInlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>
}

export interface TelegramUpdate {
  update_id: number
  callback_query?: {
    id: string
    data?: string
    from: { id: number }
    message?: { message_id: number; chat: { id: number } }
  }
}

export class TelegramService extends Context.Service<
  TelegramService,
  {
    readonly sendMessage: (payload: {
      text: string
      replyMarkup?: TelegramInlineKeyboard
    }) => Effect.Effect<{ messageId: number }, TelegramNotConfigured | TelegramHttpError>
    readonly getUpdates: (
      offset: number,
      timeoutSeconds: number,
    ) => Effect.Effect<TelegramUpdate[], TelegramNotConfigured | TelegramHttpError>
    readonly answerCallbackQuery: (
      callbackQueryId: string,
      text?: string,
    ) => Effect.Effect<void, TelegramNotConfigured | TelegramHttpError>
    readonly editMessageText: (
      messageId: number,
      text: string,
      replyMarkup?: TelegramInlineKeyboard,
    ) => Effect.Effect<void, TelegramNotConfigured | TelegramHttpError>
  }
>()("TelegramService") {}

export const TelegramServiceLive = Layer.effect(
  TelegramService,
  Effect.gen(function* () {
    const configService = yield* ConfigService
    const log = yield* LogService

    const getApiInfo = () =>
      requireConfigured(
        configService,
        (c) => ({ botToken: c.telegram.botToken, chatId: c.telegram.chatId }),
        (info) => info.botToken.length > 0 && info.chatId.length > 0,
        "Telegram is not configured",
        (message) => new TelegramNotConfigured({ message }),
      )

    const callTelegramApi = <T,>(botToken: string, method: string, body: Record<string, unknown>) =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
          if (!response.ok) {
            let text = ""
            try { text = await response.text() } catch { /* */ }
            throw new Error(`Telegram HTTP ${response.status}: ${text || response.statusText}`)
          }
          const json = (await response.json()) as { ok: boolean; result?: T; description?: string }
          if (!json.ok) {
            throw new Error(`Telegram API error: ${json.description ?? "unknown error"}`)
          }
          return json
        },
        catch: (e) => {
          const message = e instanceof Error ? e.message : String(e)
          return new TelegramHttpError({ message })
        },
      })

    const sendMessage = (payload: { text: string; replyMarkup?: TelegramInlineKeyboard }) =>
      Effect.gen(function* () {
        yield* log.info("telegram", "sendMessage")
        const info = yield* getApiInfo()
        const response = yield* callTelegramApi<{ message_id: number }>(info.botToken, "sendMessage", {
          chat_id: info.chatId,
          text: payload.text,
          parse_mode: "HTML",
          ...(payload.replyMarkup ? { reply_markup: payload.replyMarkup } : {}),
        })
        const result = response.result
        if (typeof result?.message_id !== "number") {
          return yield* new TelegramHttpError({ message: "sendMessage response missing message_id" })
        }
        yield* log.info("telegram", "sendMessage — sent")
        return { messageId: result.message_id }
      })

    const getUpdates = (offset: number, timeoutSeconds: number) =>
      Effect.gen(function* () {
        const info = yield* getApiInfo()
        const response = yield* callTelegramApi<TelegramUpdate[]>(info.botToken, "getUpdates", {
          offset,
          timeout: timeoutSeconds,
          allowed_updates: ["callback_query"],
        })
        return response.result ?? []
      })

    const answerCallbackQuery = (callbackQueryId: string, text?: string) =>
      Effect.gen(function* () {
        const info = yield* getApiInfo()
        yield* callTelegramApi(info.botToken, "answerCallbackQuery", {
          callback_query_id: callbackQueryId,
          ...(text ? { text } : {}),
        })
      })

    const editMessageText = (messageId: number, text: string, replyMarkup?: TelegramInlineKeyboard) =>
      Effect.gen(function* () {
        const info = yield* getApiInfo()
        yield* callTelegramApi(info.botToken, "editMessageText", {
          chat_id: info.chatId,
          message_id: messageId,
          text,
          parse_mode: "HTML",
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        })
      })

    return { sendMessage, getUpdates, answerCallbackQuery, editMessageText }
  }),
)
