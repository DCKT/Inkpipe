import { Duration, Option, Schema, String } from "effect"
import { Toast as UiToast } from "@foldkit/ui"

/** What a toast shows. The Toast component owns lifecycle + a11y only. */
export const ToastPayload = Schema.Struct({
  title: Schema.String,
  maybeDescription: Schema.Option(Schema.String),
})
export type ToastPayload = typeof ToastPayload.Type

export const Toast = UiToast.make(ToastPayload)

/**
 * A request to show a toast. Pages never touch the root's toast stack: they
 * hand one of these up (as an OutMessage) and the root shows it.
 */
export const ToastRequest = Schema.Struct({
  variant: UiToast.Variant,
  title: Schema.String,
  maybeDescription: Schema.Option(Schema.String),
})
export type ToastRequest = typeof ToastRequest.Type

const request =
  (variant: UiToast.Variant) =>
  (title: string, description?: string): ToastRequest => ({
    variant,
    title,
    maybeDescription: Option.liftPredicate(String.isNonEmpty)(description ?? ""),
  })

export const toast = {
  info: request("Info"),
  success: request("Success"),
  warning: request("Warning"),
  error: request("Error"),
}

/** Parity with the old Ark toaster: success is brief, everything else lingers. */
export const durationFor = (variant: UiToast.Variant): Duration.Duration =>
  variant === "Success" ? Duration.seconds(2) : Duration.seconds(5)

export const toShowInput = ({ variant, title, maybeDescription }: ToastRequest) => ({
  variant,
  duration: durationFor(variant),
  payload: { title, maybeDescription },
})

export const initialToasts = (): typeof Toast.Model.Type =>
  Toast.init({ id: "toasts", swipeToDismiss: {} })
