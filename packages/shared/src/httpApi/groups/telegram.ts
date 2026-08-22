import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { TelegramNotConfiguredS, TelegramHttpErrorS } from "../errors"

const TelegramErrors = [TelegramNotConfiguredS, TelegramHttpErrorS] as const

export const TelegramTestResponseSchema = Schema.Struct({ success: Schema.Boolean })

export const TelegramGroup = HttpApiGroup.make("telegram").add(
  HttpApiEndpoint.post("test", "/api/telegram/test", {
    success: TelegramTestResponseSchema,
    error: TelegramErrors,
  }),
)
