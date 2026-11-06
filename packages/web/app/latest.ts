import { ProwlarrResultSchema } from "@inkpipe/shared"
import { Array as Arr, Clock, Effect, Option, Schema } from "effect"
import { Command, Submodel, Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, callApi } from "./api"
import { downloadBar } from "./downloadBar"
import { STARTED_TOAST_DESCRIPTION, requestDownload, startedToastTitle } from "./downloadRequest"
import { buttonClass } from "./form"
import { pageHeader } from "./pageHeader"
import * as Results from "./results"
import { ToastRequest, toast } from "./toast"

// MODEL

export const LoadState = defineTaggedUnion({
  Idle: {},
  Loading: {},
  Failed: { reason: Schema.String },
  Done: {},
})
export type LoadState = typeof LoadState.Type

export const Model = Schema.Struct({
  load: LoadState,
  results: Results.Model,
  isStartingDownload: Schema.Boolean,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedRefresh: {},
  SucceededFetchLatest: { results: Schema.Array(ProwlarrResultSchema), nowMillis: Schema.Finite },
  FailedFetchLatest: { reason: Schema.String },
  GotResultsMessage: { message: Results.Message },
  ClickedDownload: {},
  SucceededDownload: { started: Schema.Finite },
  FailedDownload: { reason: Schema.String },
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  RequestedToast: { request: ToastRequest },
})
export type OutMessage = typeof OutMessage.Type

// COMMAND

export const FetchLatest = Command.define("FetchLatest", {
  messages: [Message.SucceededFetchLatest, Message.FailedFetchLatest],
  execute: callApi((client) => client.latest.latest()).pipe(
    Effect.flatMap((results) =>
      Effect.map(Clock.currentTimeMillis, (nowMillis) =>
        Message.SucceededFetchLatest({ results, nowMillis }),
      ),
    ),
    Effect.catch(({ message }) => Effect.succeed(Message.FailedFetchLatest({ reason: message }))),
  ),
})

export const StartDownload = Command.define("StartDownload", {
  args: { items: Schema.Array(ProwlarrResultSchema) },
  messages: [Message.SucceededDownload, Message.FailedDownload],
  execute: ({ items }) =>
    requestDownload(items, Option.none(), Option.none()).pipe(
      Effect.match({
        onSuccess: ({ started }) => Message.SucceededDownload({ started }),
        onFailure: ({ message }) => Message.FailedDownload({ reason: message }),
      }),
    ),
})

// INIT

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, ApiClientService>

export const init = (): Model => ({
  load: LoadState.Idle(),
  results: Results.init(),
  isStartingDownload: false,
})

// UPDATE

const foldResults = Update.foldChild({
  update: Results.update,
  read: (model: Model) => Option.some(model.results),
  write: (model, results) => modifyFields(model, { results: () => results }),
  toParentMessage: (message) => Message.GotResultsMessage({ message }),
})

const foldEnsureSeries = Update.foldChildStep({
  update: Results.ensureSeries,
  read: (model: Model) => Option.some(model.results),
  write: (model, results) => modifyFields(model, { results: () => results }),
  toParentMessage: (message) => Message.GotResultsMessage({ message }),
})

const startLoading = (model: Model): Model =>
  modifyFields(model, {
    load: () => LoadState.Loading(),
    results: Results.clearSelection,
  })

/**
 * Entering the page loads the latest releases afresh (and the Komga series,
 * once). If a load is already running it is reused: a second request could
 * answer out of order and overwrite what the user is already looking at.
 */
export const enter = (model: Model): UpdateReturn => {
  if (model.load._tag === "Loading") {
    return foldEnsureSeries(model)
  }

  const ensured = foldEnsureSeries(startLoading(model))

  return {
    model: ensured.model,
    commands: [...(ensured.commands ?? []), FetchLatest()],
  }
}

const isLoading = (model: Model): boolean => model.load._tag === "Loading"

const selectedCount = (model: Model): number => Results.selectedItems(model.results).length

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ClickedRefresh: () =>
      isLoading(model) ? { model } : { model: startLoading(model), commands: [FetchLatest()] },

    // Only the answer to the load we're waiting for counts.
    SucceededFetchLatest: ({ results, nowMillis }) =>
      isLoading(model)
        ? {
            model: modifyFields(model, {
              load: () => LoadState.Done(),
              results: (current) => Results.setItems(current, results, nowMillis),
            }),
          }
        : { model },

    FailedFetchLatest: ({ reason }) =>
      isLoading(model)
        ? { model: modifyFields(model, { load: () => LoadState.Failed({ reason }) }) }
        : { model },

    GotResultsMessage: ({ message }) => foldResults(model, message),

    ClickedDownload: () => {
      const items = Results.selectedItems(model.results)

      return Arr.isReadonlyArrayEmpty(items) || model.isStartingDownload
        ? { model }
        : {
            model: modifyFields(model, { isStartingDownload: () => true }),
            commands: [StartDownload({ items })],
          }
    },

    SucceededDownload: ({ started }) => ({
      model: modifyFields(model, {
        isStartingDownload: () => false,
        results: Results.clearSelection,
      }),
      outMessage: OutMessage.RequestedToast({
        request: toast.success(startedToastTitle(started), STARTED_TOAST_DESCRIPTION),
      }),
    }),

    FailedDownload: ({ reason }) => ({
      model: modifyFields(model, { isStartingDownload: () => false }),
      outMessage: OutMessage.RequestedToast({
        request: toast.error("Failed to start downloads", reason),
      }),
    }),
  })

// VIEW

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  const loading = isLoading(model)
  const count = model.results.items.length

  return h.main(
    [h.Class("page-wrap flex flex-col gap-6 pb-8 pt-8 sm:px-4")],
    [
      pageHeader(h, {
        numeral: "II",
        label: "Latest",
        title: "Latest Mangas",
        ...(model.load._tag === "Done" ? { meta: `${count} results` } : {}),
      }),
      h.section(
        [h.Class("flex items-center justify-end")],
        [
          h.button(
            [
              h.Type("button"),
              h.Disabled(loading),
              h.OnClick(Message.ClickedRefresh()),
              h.Class(buttonClass.refresh),
            ],
            [loading ? "Refreshing..." : "Refresh"],
          ),
        ],
      ),
      ...LoadState.match<ReadonlyArray<Html>>(model.load, {
        Idle: () => [],
        Loading: () =>
          count === 0
            ? [
                h.p(
                  [h.Role("status"), h.Class("text-sm text-secondary")],
                  ["Loading latest releases…"],
                ),
              ]
            : [],
        Failed: ({ reason }) => [
          h.div(
            [
              h.Role("alert"),
              h.Class("island-shell rounded-2xl border-red-200 p-4 text-sm text-red-600"),
            ],
            [reason],
          ),
        ],
        Done: () =>
          count === 0
            ? [h.p([h.Class("text-sm text-secondary")], ["No recent releases found."])]
            : [],
      }),
      h.submodel({
        slotId: "latest-results",
        model: model.results,
        view: Results.view,
        viewInputs: { idPrefix: "latest" },
        toParentMessage: (message) => Message.GotResultsMessage({ message }),
      }),
      downloadBar(h, {
        selectedCount: selectedCount(model),
        isStarting: model.isStartingDownload,
        onClick: Message.ClickedDownload(),
      }),
    ],
  )
})
