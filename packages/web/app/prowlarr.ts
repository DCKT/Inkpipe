import { Dialog } from "@foldkit/ui"
import { ProwlarrResultSchema } from "@inkpipe/shared"
import { Array as Arr, Clock, Effect, Option, Schema, String as Str } from "effect"
import { Command, Dom, Submodel, Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, callApi } from "./api"
import { downloadBar } from "./downloadBar"
import { downloadDialogView } from "./downloadDialogView"
import { STARTED_TOAST_DESCRIPTION, requestDownload, startedToastTitle } from "./downloadRequest"
import * as FolderSelect from "./folderSelect"
import { pageHeader } from "./pageHeader"
import { searchForm } from "./searchForm"
import * as Results from "./results"
import { ToastRequest, toast } from "./toast"

export const SEARCH_INPUT_ID = "prowlarr-search"

// MODEL

export const SearchState = defineTaggedUnion({
  Idle: {},
  Searching: { query: Schema.String },
  Failed: { query: Schema.String, reason: Schema.String },
  Done: { query: Schema.String },
})
export type SearchState = typeof SearchState.Type

export const Model = Schema.Struct({
  queryInput: Schema.String,
  search: SearchState,
  results: Results.Model,
  downloadDialog: Dialog.Model,
  folder: FolderSelect.Model,
  isStartingDownload: Schema.Boolean,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ChangedQuery: { value: Schema.String },
  SubmittedSearch: {},
  SucceededSearch: {
    query: Schema.String,
    results: Schema.Array(ProwlarrResultSchema),
    nowMillis: Schema.Finite,
  },
  FailedSearch: { query: Schema.String, reason: Schema.String },
  GotResultsMessage: { message: Results.Message },
  GotFolderMessage: { message: FolderSelect.Message },
  GotDownloadDialogMessage: { message: Dialog.Message },
  ClickedDownload: {},
  ConfirmedDownload: {},
  SucceededDownload: { started: Schema.Finite },
  FailedDownload: { reason: Schema.String },
  CompletedFocusSearch: {},
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  RequestedToast: { request: ToastRequest },
})
export type OutMessage = typeof OutMessage.Type

// COMMAND

export const SearchProwlarr = Command.define("SearchProwlarr", {
  args: { query: Schema.String },
  messages: [Message.SucceededSearch, Message.FailedSearch],
  execute: ({ query }) =>
    callApi((client) => client.search.search({ query: { q: query } })).pipe(
      Effect.flatMap((results) =>
        Effect.map(Clock.currentTimeMillis, (nowMillis) =>
          Message.SucceededSearch({ query, results, nowMillis }),
        ),
      ),
      Effect.catch(({ message }) =>
        Effect.succeed(Message.FailedSearch({ query, reason: message })),
      ),
    ),
})

export const StartDownload = Command.define("StartDownload", {
  args: {
    items: Schema.Array(ProwlarrResultSchema),
    subfolder: Schema.Option(Schema.String),
    newFolder: Schema.Option(Schema.Boolean),
  },
  messages: [Message.SucceededDownload, Message.FailedDownload],
  execute: ({ items, subfolder, newFolder }) =>
    requestDownload(items, subfolder, newFolder).pipe(
      Effect.match({
        onSuccess: ({ started }) => Message.SucceededDownload({ started }),
        onFailure: ({ message }) => Message.FailedDownload({ reason: message }),
      }),
    ),
})

export const FocusSearch = Command.define("FocusSearch", {
  messages: [Message.CompletedFocusSearch],
  execute: Dom.focus(`#${SEARCH_INPUT_ID}`).pipe(
    Effect.ignore,
    Effect.as(Message.CompletedFocusSearch()),
  ),
})

// INIT

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, ApiClientService>

export const init = (): Model => ({
  queryInput: "",
  search: SearchState.Idle(),
  results: Results.init(),
  downloadDialog: Dialog.init({ id: "download-dialog" }),
  folder: FolderSelect.initial(),
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

const foldFolder = Update.foldChild({
  update: FolderSelect.update,
  read: (model: Model) => Option.some(model.folder),
  write: (model, folder) => modifyFields(model, { folder: () => folder }),
  toParentMessage: (message) => Message.GotFolderMessage({ message }),
})

const foldRefreshFolders = Update.foldChildStep({
  update: FolderSelect.refresh,
  read: (model: Model) => Option.some(model.folder),
  write: (model, folder) => modifyFields(model, { folder: () => folder }),
  toParentMessage: (message) => Message.GotFolderMessage({ message }),
})

const foldDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => (model) => ({ model }),
  Closed: () => (model) => ({ model }),
})

const dialogFold = {
  read: (model: Model) => Option.some(model.downloadDialog),
  write: (model: Model, downloadDialog: Dialog.Model) =>
    modifyFields(model, { downloadDialog: () => downloadDialog }),
  toParentMessage: (message: Dialog.Message) => Message.GotDownloadDialogMessage({ message }),
  foldOutMessage: foldDialogOutMessage,
}

const foldDialog = Update.foldChild({ update: Dialog.update, ...dialogFold })
const foldDialogOpen = Update.foldChildStep({ update: Dialog.open, ...dialogFold })
const foldDialogClose = Update.foldChildStep({ update: Dialog.close, ...dialogFold })

/** Entering the page: focus the search box and make sure Komga series are loading. */
export const enter = (model: Model): UpdateReturn => {
  const ensured = foldEnsureSeries(model)

  return {
    model: ensured.model,
    commands: [...(ensured.commands ?? []), FocusSearch()],
  }
}

const selectedCount = (model: Model): number => Results.selectedItems(model.results).length

const isSearching = (model: Model): boolean => model.search._tag === "Searching"

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ChangedQuery: ({ value }) => ({ model: modifyFields(model, { queryInput: () => value }) }),

    SubmittedSearch: () => {
      const query = Str.trim(model.queryInput)

      return query === "" || isSearching(model)
        ? { model }
        : {
            // The old list goes at once, so nothing can be selected or opened
            // for download while its replacement is on the way.
            model: modifyFields(model, {
              search: () => SearchState.Searching({ query }),
              results: (current) => Results.setItems(current, [], current.nowMillis),
            }),
            commands: [SearchProwlarr({ query })],
          }
    },

    // A slower answer to an earlier search must not replace the current one.
    SucceededSearch: ({ query, results, nowMillis }) =>
      isCurrentSearch(model, query)
        ? {
            model: modifyFields(model, {
              search: () => SearchState.Done({ query }),
              results: (current) => Results.setItems(current, results, nowMillis),
            }),
          }
        : { model },

    FailedSearch: ({ query, reason }) =>
      isCurrentSearch(model, query)
        ? {
            model: modifyFields(model, {
              search: () => SearchState.Failed({ query, reason }),
              results: (current) => Results.setItems(current, [], current.nowMillis),
            }),
          }
        : { model },

    GotResultsMessage: ({ message }) => foldResults(model, message),

    GotFolderMessage: ({ message }) => foldFolder(model, message),

    GotDownloadDialogMessage: ({ message }) => foldDialog(model, message),

    ClickedDownload: () =>
      selectedCount(model) === 0 || model.isStartingDownload || model.downloadDialog.isOpen
        ? { model }
        : // A fresh dialog starts empty and offers folders created since last time.
          Update.combine(modifyFields(model, { folder: FolderSelect.clearInput }), [
            foldRefreshFolders,
            foldDialogOpen,
          ]),

    ConfirmedDownload: () => {
      const items = Results.selectedItems(model.results)

      if (Arr.isReadonlyArrayEmpty(items) || model.isStartingDownload || isFolderUnsettled(model)) {
        return { model }
      }

      const chosen = FolderSelect.requestFor(model.folder)

      return Update.combine(modifyFields(model, { isStartingDownload: () => true }), [
        foldDialogClose,
        (stepModel) => ({
          model: stepModel,
          commands: [
            StartDownload({
              items,
              subfolder: Option.map(chosen, ({ subfolder }) => subfolder),
              newFolder: Option.flatMap(chosen, ({ newFolder }) => newFolder),
            }),
          ],
        }),
      ])
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

    CompletedFocusSearch: () => ({ model }),
  })

/** A folder is typed but the list is still loading: wait rather than guess. */
export const isFolderUnsettled = (model: Model): boolean =>
  FolderSelect.isPending(model.folder) && Option.isSome(FolderSelect.selection(model.folder))

const isCurrentSearch = (model: Model, query: string): boolean =>
  model.search._tag === "Searching" && model.search.query === query

// VIEW

const bannerClass = "island-shell rounded-2xl p-4 text-sm"

const resultCountMeta = (model: Model): string | undefined =>
  model.search._tag === "Done" ? `${model.results.items.length} results` : undefined

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  const searching = isSearching(model)

  const body: ReadonlyArray<Html> = SearchState.match<ReadonlyArray<Html>>(model.search, {
    Idle: () => [
      h.p([h.Class("text-sm text-secondary")], ["Search for a book or comic to get started."]),
    ],
    Searching: () => [],
    Failed: ({ reason }) => [
      h.div([h.Role("alert"), h.Class(`${bannerClass} border-red-200 text-red-600`)], [reason]),
    ],
    Done: ({ query }) =>
      Arr.isReadonlyArrayEmpty(model.results.items)
        ? [h.p([h.Class("text-sm text-secondary")], [`No results for "${query}".`])]
        : [],
  })

  const chosenCount = selectedCount(model)

  const dialogView = downloadDialogView(h, {
    count: chosenCount,
    folder: model.folder,
    toFolderMessage: (message) => Message.GotFolderMessage({ message }),
    onConfirm: Message.ConfirmedDownload(),
    isConfirmDisabled: isFolderUnsettled(model),
  })

  return h.main(
    [h.Class("page-wrap flex flex-col gap-4 pb-8 pt-8 sm:px-4")],
    [
      pageHeader(h, {
        numeral: "I",
        label: "Prowlarr",
        title: "Search",
        ...(resultCountMeta(model) === undefined ? {} : { meta: resultCountMeta(model) }),
      }),
      h.section(
        [],
        [
          searchForm(h, {
            inputId: SEARCH_INPUT_ID,
            value: model.queryInput,
            label: "Search for a book or comic",
            placeholder: "Search for a book or comic...",
            isSearching: searching,
            onInput: (value) => Message.ChangedQuery({ value }),
            onSubmit: Message.SubmittedSearch(),
          }),
        ],
      ),
      ...body,
      h.submodel({
        slotId: "prowlarr-results",
        model: model.results,
        view: Results.view,
        viewInputs: { idPrefix: "prowlarr" },
        toParentMessage: (message) => Message.GotResultsMessage({ message }),
      }),
      downloadBar(h, {
        selectedCount: chosenCount,
        isStarting: model.isStartingDownload,
        onClick: Message.ClickedDownload(),
      }),
      h.submodel({
        slotId: model.downloadDialog.id,
        model: model.downloadDialog,
        view: Dialog.view,
        viewInputs: { toView: dialogView },
        toParentMessage: (message) => Message.GotDownloadDialogMessage({ message }),
      }),
    ],
  )
})
