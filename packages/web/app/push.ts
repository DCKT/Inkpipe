import { Effect, Option, Schema } from "effect"
import { Command, Submodel, type Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

import type { ApiClientService } from "./api"
import { buttonClass } from "./form"
import { type PushStatus, detectStatus, realBrowser, subscribe, unsubscribe } from "./pushFlow"

// The "Get notified" banner on the Watches page.

// MODEL

export const PushStatusSchema = Schema.Literals(["Unsupported", "Denied", "Default", "Subscribed"])

export const Model = Schema.Struct({
  /** `None` until the browser has been asked. */
  maybeStatus: Schema.Option(PushStatusSchema),
  isWorking: Schema.Boolean,
  maybeError: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  CompletedDetectStatus: { status: PushStatusSchema },
  ClickedEnable: {},
  ClickedDisable: {},
  SucceededEnable: { status: PushStatusSchema },
  SucceededDisable: {},
  FailedPush: { reason: Schema.String },
})
export type Message = typeof Message.Type

// COMMAND

export const DetectStatus = Command.define("DetectPushStatus", {
  messages: [Message.CompletedDetectStatus],
  // Storage can be blocked and APIs can be missing: either way, treat it as unsupported.
  execute: Effect.try(() => detectStatus(realBrowser)).pipe(
    Effect.orElseSucceed((): PushStatus => "Unsupported"),
    Effect.map((status) => Message.CompletedDetectStatus({ status })),
  ),
})

export const EnablePush = Command.define("EnablePush", {
  messages: [Message.SucceededEnable, Message.FailedPush],
  execute: subscribe(realBrowser).pipe(
    Effect.match({
      onSuccess: (outcome) =>
        Message.SucceededEnable({
          status:
            outcome === "Subscribed" ? "Subscribed" : outcome === "Denied" ? "Denied" : "Default",
        }),
      onFailure: ({ message }) => Message.FailedPush({ reason: message }),
    }),
  ),
})

export const DisablePush = Command.define("DisablePush", {
  messages: [Message.SucceededDisable, Message.FailedPush],
  execute: unsubscribe(realBrowser).pipe(
    Effect.match({
      onSuccess: () => Message.SucceededDisable(),
      onFailure: ({ message }) => Message.FailedPush({ reason: message }),
    }),
  ),
})

// INIT

type UpdateReturn = Update.Return<Model, Message, ApiClientService>

export const init = (): Model => ({
  maybeStatus: Option.none(),
  isWorking: false,
  maybeError: Option.none(),
})

/** Check what the browser currently allows (e.g. permission changed in settings). */
export const refresh = (model: Model): UpdateReturn => ({ model, commands: [DetectStatus()] })

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    CompletedDetectStatus: ({ status }) => ({
      model: modifyFields(model, { maybeStatus: () => Option.some(status) }),
    }),

    ClickedEnable: () =>
      model.isWorking
        ? { model }
        : {
            model: modifyFields(model, { isWorking: () => true, maybeError: () => Option.none() }),
            commands: [EnablePush()],
          },

    ClickedDisable: () =>
      model.isWorking
        ? { model }
        : {
            model: modifyFields(model, { isWorking: () => true, maybeError: () => Option.none() }),
            commands: [DisablePush()],
          },

    SucceededEnable: ({ status }) => ({
      model: modifyFields(model, {
        isWorking: () => false,
        maybeStatus: () => Option.some(status),
      }),
    }),

    // Turning off leaves permission as it was; re-read what the browser now says.
    SucceededDisable: () => ({
      model: modifyFields(model, { isWorking: () => false }),
      commands: [DetectStatus()],
    }),

    FailedPush: ({ reason }) => ({
      model: modifyFields(model, { isWorking: () => false, maybeError: () => Option.some(reason) }),
    }),
  })

// VIEW

const bannerClass =
  "island-shell mb-4 flex items-center justify-between rounded-2xl border-border p-3 text-sm"

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  const banner = Option.match(model.maybeStatus, {
    onNone: () => [],
    onSome: (status): ReadonlyArray<Html> => {
      switch (status) {
        case "Unsupported":
          return []
        case "Denied":
          return [
            h.div(
              [h.DataAttribute("push", "denied"), h.Class(`${bannerClass} text-secondary`)],
              ["Notifications blocked. Allow them in your browser settings to receive alerts."],
            ),
          ]
        case "Default":
          return [
            h.div(
              [h.DataAttribute("push", "default"), h.Class(bannerClass)],
              [
                h.span([h.Class("text-secondary")], ["Get notified when new matches are found"]),
                h.button(
                  [
                    h.Type("button"),
                    h.Disabled(model.isWorking),
                    h.OnClick(Message.ClickedEnable()),
                    h.Class(`${buttonClass.primary} px-4 py-1.5 text-xs`),
                  ],
                  [model.isWorking ? "Enabling..." : "Enable alerts"],
                ),
              ],
            ),
          ]
        case "Subscribed":
          return [
            h.div(
              [h.DataAttribute("push", "subscribed"), h.Class(`${bannerClass} text-secondary`)],
              [
                h.span([], ["Notifications on"]),
                h.button(
                  [
                    h.Type("button"),
                    h.Disabled(model.isWorking),
                    h.OnClick(Message.ClickedDisable()),
                    h.Class("text-xs text-secondary transition-colors hover:text-red-500"),
                  ],
                  ["Turn off"],
                ),
              ],
            ),
          ]
      }
    },
  })

  return h.div(
    [],
    [
      ...banner,
      ...Option.match(model.maybeError, {
        onNone: () => [],
        onSome: (reason) => [
          h.p(
            [h.Role("alert"), h.Class("mb-4 text-sm text-red-600")],
            [`Couldn't update notifications: ${reason}`],
          ),
        ],
      }),
    ],
  )
})
