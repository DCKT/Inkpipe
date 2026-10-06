import { implement } from "@inkpipe/capability/implement"
import { testTelegramContract } from "@inkpipe/shared"
import { Effect } from "effect"
import { TelegramService } from "../layers/integrations/Telegram"

export const testTelegram = implement(testTelegramContract, () =>
  TelegramService.use((telegram) =>
    telegram.sendMessage({ text: "✅ Inkpipe test notification" }),
  ).pipe(Effect.as({ success: true })),
)

export const telegramCapabilities = [testTelegram] as const
