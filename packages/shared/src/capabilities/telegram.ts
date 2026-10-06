import { defineContract } from "@inkpipe/capability/contract"
import { Schema } from "effect"
import { TelegramHttpErrorS, TelegramNotConfiguredS } from "../httpApi/errors"
import { SuccessFlagSchema } from "./settings"

export const testTelegramContract = defineContract("testTelegram", {
  description: "Send a test notification through the Telegram bot",
  annotations: { openWorld: true },
  http: { method: "POST", path: "/api/telegram/test" },
  input: Schema.Struct({}),
  output: SuccessFlagSchema,
  failure: Schema.Union([TelegramNotConfiguredS, TelegramHttpErrorS]),
})

export const telegramContracts = [testTelegramContract] as const
