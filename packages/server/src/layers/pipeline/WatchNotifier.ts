import { Effect } from "effect"
import type { Watch, WatchAlertId } from "@inkpipe/shared"
import { PushService } from "./Push"
import { TelegramService, escapeHtml } from "../integrations/Telegram"
import { LogService } from "../core/Log"
import { ConfigService } from "../core/Config"

export interface MatchedAlert {
  id: WatchAlertId
  title: string
  indexer: string
  seeders: number
}

/**
 * A watch with a folder assigned is "book" content — it goes through the
 * full download/convert/upload pipeline into that folder. Without one, it's
 * "non-book" — matches only get saved to AllDebrid, nothing downloaded
 * locally. This single field is the discriminant everywhere a watch's
 * matches are acted on (notification buttons, the Telegram callback
 * listener, and the web UI's watch-detail page).
 */
export function isBookWatch(watch: Watch): boolean {
  return watch.subfolder !== null && watch.subfolder.length > 0
}

/**
 * Sends push + Telegram notifications for a watch run's new matches. Shared
 * between the scheduled watcher process and the web UI's manual "check now"
 * trigger so the two don't silently drift out of sync with each other.
 */
export function notifyWatchMatches(watch: Watch, matchedAlerts: readonly MatchedAlert[]) {
  return Effect.gen(function* () {
    const newAlerts = matchedAlerts.length
    if (newAlerts === 0) return

    const push = yield* PushService
    const telegram = yield* TelegramService
    const config = yield* ConfigService
    const log = yield* LogService

    yield* push.sendNotification({
      title: `Watch: ${watch.name}`,
      body: `${newAlerts} new match${newAlerts !== 1 ? "es" : ""} found`,
      tag: `watch-${watch.id}`,
    })

    const book = isBookWatch(watch)
    const buttonText = book ? "⬇️ Download" : "💾 Save to Magnet"
    const callbackPrefix = book ? "dl" : "sm"

    // Buttons need to target a specific alert, so each of the first few
    // matches gets its own message rather than one aggregated summary.
    // Capped to avoid flooding the chat when a watch matches a large batch
    // at once; the rest are only surfaced in the web UI. The first message
    // of the batch gets a separator line so it's visually distinct from
    // whatever was already in the chat before this run.
    for (const [index, alert] of matchedAlerts.slice(0, 5).entries()) {
      const separator = index === 0 ? "➖➖➖➖➖➖➖➖➖➖\n" : ""
      yield* telegram
        .sendMessage({
          text: `${separator}<b>Watch: ${escapeHtml(watch.name)}</b>\n${escapeHtml(alert.title)}\n\n${escapeHtml(alert.indexer)} · ${alert.seeders} seeders`,
          replyMarkup: {
            inline_keyboard: [[{ text: buttonText, callback_data: `${callbackPrefix}:${watch.id}:${alert.id}` }]],
          },
        })
        .pipe(
          Effect.catch((e) => log.error("watch-notify", `"${watch.name}": telegram send failed`, e)),
        )
    }

    if (newAlerts > 5) {
      const remaining = newAlerts - 5
      // The "public URL" setting is the app's own externally-reachable
      // address (unknowable from inside the container) — without it we
      // can't build a link Telegram can actually open, so fall back to
      // plain text rather than a broken/localhost link.
      const publicUrl = yield* config.loadConfig.pipe(
        Effect.map((c) => c.general.publicUrl),
        Effect.orElseSucceed(() => ""),
      )
      const watchLink = publicUrl
        ? `${publicUrl.replace(/\/+$/, "")}/watches/${watch.id}`
        : undefined
      const seeInWebUi = watchLink
        ? `<a href="${escapeHtml(watchLink)}">see the web UI</a>`
        : "see the web UI"
      yield* telegram
        .sendMessage({
          text: `+${remaining} more match${remaining !== 1 ? "es" : ""} for <b>${escapeHtml(watch.name)}</b> — ${seeInWebUi}`,
        })
        .pipe(
          Effect.catch((e) => log.error("watch-notify", `"${watch.name}": telegram summary send failed`, e)),
        )
    }
  })
}
