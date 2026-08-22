import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { TelegramService } from "../../layers/integrations/Telegram"
import { InkpipeApi } from "@inkpipe/shared"

export const TelegramGroupLive = HttpApiBuilder.group(InkpipeApi, "telegram", (handlers) =>
  handlers.handle("test", () =>
    Effect.gen(function* () {
      const telegram = yield* TelegramService
      yield* telegram.sendMessage({ text: "✅ Inkpipe test notification" })
      return { success: true }
    })),
)
