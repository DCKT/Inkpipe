import { Cause, Context, Effect, Exit, Layer, Ref } from "effect"
import { alertToProwlarrResult, WatchId, WatchAlertId } from "@inkpipe/shared"
import { ConfigService } from "../core/Config"
import { LogService } from "../core/Log"
import { TelegramService, escapeHtml, type TelegramUpdate } from "../integrations/Telegram"
import { WatchStoreService } from "../storage/WatchStore"
import { PipelineService } from "./Pipeline"
import { AllDebridService } from "../integrations/AllDebrid"

export class TelegramCallbackListenerService extends Context.Service<
  TelegramCallbackListenerService,
  {
    readonly run: Effect.Effect<never>
  }
>()("TelegramCallbackListenerService") {}

export type WatchCallbackAction = "download" | "saveMagnet"

const CALLBACK_PREFIX: Record<WatchCallbackAction, string> = {
  download: "dl:",
  saveMagnet: "sm:",
}

function failureMessage(cause: Cause.Cause<unknown>): string {
  const squashed = Cause.squash(cause)
  if (squashed instanceof Error) return squashed.message
  if (squashed && typeof squashed === "object" && "message" in squashed && typeof squashed.message === "string") {
    return squashed.message
  }
  return String(squashed)
}

export function parseWatchCallback(
  data: string,
): { action: WatchCallbackAction; watchId: WatchId; alertId: WatchAlertId } | undefined {
  for (const action of Object.keys(CALLBACK_PREFIX) as WatchCallbackAction[]) {
    const prefix = CALLBACK_PREFIX[action]
    if (!data.startsWith(prefix)) continue
    const [watchIdRaw, alertIdRaw] = data.slice(prefix.length).split(":")
    if (!watchIdRaw || !alertIdRaw || !/^\d+$/.test(watchIdRaw) || !/^\d+$/.test(alertIdRaw)) return undefined
    return { action, watchId: WatchId.make(Number(watchIdRaw)), alertId: WatchAlertId.make(Number(alertIdRaw)) }
  }
  return undefined
}

export const TelegramCallbackListenerServiceLive = Layer.effect(
  TelegramCallbackListenerService,
  Effect.gen(function* () {
    const configService = yield* ConfigService
    const telegram = yield* TelegramService
    const watchStore = yield* WatchStoreService
    const pipeline = yield* PipelineService
    const allDebrid = yield* AllDebridService
    const log = yield* LogService

    const offsetRef = yield* Ref.make(0)

    const handleCallbackQuery = (cb: NonNullable<TelegramUpdate["callback_query"]>, configuredChatId: string) =>
      Effect.gen(function* () {
        if (!cb.message || String(cb.message.chat.id) !== configuredChatId) {
          yield* log.info("telegram-listener", "Ignoring callback from unexpected chat", cb.from.id)
          return
        }

        const parsed = cb.data ? parseWatchCallback(cb.data) : undefined
        if (!parsed) return

        const { action, watchId, alertId } = parsed
        const messageId = cb.message.message_id

        const alert = yield* watchStore.getAlert(watchId, alertId)
        const alreadyText = action === "download" ? "Already downloaded" : "Already saved"

        if (alert.acknowledged) {
          yield* telegram.answerCallbackQuery(cb.id, alreadyText)
          yield* telegram.editMessageText(
            messageId,
            `${escapeHtml(alert.title)}\n\n✅ ${alreadyText}`,
            { inline_keyboard: [] },
          )
          return
        }

        if (action === "download") {
          // Read the watch's folder live rather than trusting anything
          // baked into the button, so an edit to the watch after the alert
          // was sent still takes effect.
          const watch = yield* watchStore.getWatch(watchId)
          // The pipeline (download -> convert -> upload) can take minutes —
          // fork it into the background rather than awaiting it here, same
          // as the web UI's /api/download handler, so Telegram gets an
          // immediate acknowledgment instead of the button spinning for the
          // whole run. Once it actually finishes, send a separate follow-up
          // message (not an edit — the original message already got its
          // "request sent" update) so the user learns the real outcome
          // without having to check the Jobs page.
          yield* Effect.forkDetach(
            pipeline.runPipeline(alertToProwlarrResult(alert), watch.subfolder ?? undefined, false).pipe(
              Effect.exit,
              Effect.flatMap((exit) =>
                telegram.sendMessage({
                  text: Exit.isSuccess(exit)
                    ? `✅ Download complete: ${escapeHtml(alert.title)}`
                    : `❌ Download failed: ${escapeHtml(alert.title)}\n${escapeHtml(failureMessage(exit.cause))}`,
                }),
              ),
              Effect.catch((e) =>
                log.error("telegram-listener", `"${alert.title}": failed to send download outcome message`, e),
              ),
            ),
          )
          yield* watchStore.acknowledgeAlert(watchId, alertId)
          yield* telegram.answerCallbackQuery(cb.id, "Download request sent")
          yield* telegram.editMessageText(
            messageId,
            `${escapeHtml(alert.title)}\n\n✅ Download request sent — check the Jobs page for progress`,
            { inline_keyboard: [] },
          )
          return
        }

        const magnetOrUrl = alert.magnetUrl ?? alert.downloadUrl
        if (!magnetOrUrl) {
          yield* telegram.answerCallbackQuery(cb.id, "No magnet or download URL for this alert")
          return
        }

        yield* allDebrid.uploadMagnet(magnetOrUrl)
        yield* watchStore.acknowledgeAlert(watchId, alertId)
        yield* telegram.answerCallbackQuery(cb.id, "Saved to magnet")
        yield* telegram.editMessageText(
          messageId,
          `${escapeHtml(alert.title)}\n\n✅ Saved to magnet`,
          { inline_keyboard: [] },
        )
      }).pipe(
        Effect.catch((e) => log.error("telegram-listener", "Failed to handle callback query", e)),
        // A defect from one update (bug, unexpected shape) must not drop the
        // rest of the batch — `offsetRef` has already advanced past this
        // update by the time we get here, so the batch loop can safely
        // continue to the next one instead of the whole `pollOnce` failing.
        Effect.catchDefect((defect) => log.error("telegram-listener", "Defect handling callback query", defect)),
      )

    const pollOnce = Effect.gen(function* () {
      const config = yield* configService.loadConfig
      const { botToken, chatId } = config.telegram

      if (botToken.length === 0 || chatId.length === 0) {
        yield* Effect.sleep("30 seconds")
        return
      }

      const offset = yield* Ref.get(offsetRef)
      const updates = yield* telegram.getUpdates(offset, 25)

      for (const update of updates) {
        yield* Ref.set(offsetRef, update.update_id + 1)
        if (update.callback_query) {
          yield* handleCallbackQuery(update.callback_query, chatId)
        }
      }
    }).pipe(
      Effect.catch((e) =>
        log.error("telegram-listener", "Poll failed", e).pipe(
          Effect.andThen(Effect.sleep("5 seconds")),
        ),
      ),
    )

    const run = Effect.forever(pollOnce)

    return { run }
  }),
)
