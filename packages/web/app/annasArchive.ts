import { Dialog } from "@foldkit/ui"
import { AnnasArchiveResultSchema } from "@inkpipe/shared"
import { Array as Arr, Effect, Option, Schema, String as Str } from "effect"
import { Command, Dom, Submodel, Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, callApi } from "./api"
import * as Books from "./annasResults"
import { downloadBar } from "./downloadBar"
import { downloadDialogView } from "./downloadDialogView"
import { STARTED_TOAST_DESCRIPTION, startedToastTitle } from "./downloadRequest"
import * as FolderSelect from "./folderSelect"
import { pageHeader } from "./pageHeader"
import { searchForm } from "./searchForm"
import { ToastRequest, toast } from "./toast"

export const SEARCH_INPUT_ID = "annas-archive-search"

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
  results: Books.Model,
  downloadDialog: Dialog.Model,
  folder: FolderSelect.Model,
  isStartingDownload: Schema.Boolean,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ChangedQuery: { value: Schema.String },
  SubmittedSearch: {},
  SucceededSearch: { query: Schema.String, results: Schema.Array(AnnasArchiveResultSchema) },
  FailedSearch: { query: Schema.String, reason: Schema.String },
  GotResultsMessage: { message: Books.Message },
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

export const SearchAnnasArchive = Command.define("SearchAnnasArchive", {
  args: { query: Schema.String },
  messages: [Message.SucceededSearch, Message.FailedSearch],
  execute: ({ query }) =>
    callApi((client) => client.annasArchive.search({ query: { q: query } })).pipe(
      Effect.match({
        onSuccess: (results) => Message.SucceededSearch({ query, results }),
        onFailure: ({ message }) => Message.FailedSearch({ query, reason: message }),
      }),
    ),
})

export const StartAnnasDownload = Command.define("StartAnnasDownload", {
  args: {
    items: Schema.Array(AnnasArchiveResultSchema),
    subfolder: Schema.Option(Schema.String),
    newFolder: Schema.Option(Schema.Boolean),
  },
  messages: [Message.SucceededDownload, Message.FailedDownload],
  execute: ({ items, subfolder, newFolder }) =>
    callApi((client) =>
      client.annasArchive.download({
        payload: {
          items,
          ...Option.match(subfolder, {
            onNone: () => ({}),
            onSome: (value) => ({ subfolder: value }),
          }),
          ...Option.match(newFolder, {
            onNone: () => ({}),
            onSome: (value) => ({ newFolder: value }),
          }),
        },
      }),
    ).pipe(
      Effect.match({
        onSuccess: ({ started }) => Message.SucceededDownload({ started }),
        onFailure: ({ message }) => Message.FailedDownload({ reason: message }),
      }),
    ),
})

export const FocusAnnasSearch = Command.define("FocusAnnasSearch", {
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
  results: Books.init(),
  downloadDialog: Dialog.init({ id: "annas-download-dialog" }),
  folder: FolderSelect.initial(),
  isStartingDownload: false,
})

// UPDATE

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

export const enter = (model: Model): UpdateReturn => ({ model, commands: [FocusAnnasSearch()] })

const selectedCount = (model: Model): number => Books.selectedItems(model.results).length

const isSearching = (model: Model): boolean => model.search._tag === "Searching"

const isCurrentSearch = (model: Model, query: string): boolean =>
  model.search._tag === "Searching" && model.search.query === query

/** A folder is typed but the list is still loading: wait rather than guess. */
export const isFolderUnsettled = (model: Model): boolean =>
  FolderSelect.isPending(model.folder) && Option.isSome(FolderSelect.selection(model.folder))

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ChangedQuery: ({ value }) => ({ model: modifyFields(model, { queryInput: () => value }) }),

    SubmittedSearch: () => {
      const query = Str.trim(model.queryInput)

      return query === "" || isSearching(model)
        ? { model }
        : {
            model: modifyFields(model, {
              search: () => SearchState.Searching({ query }),
              results: (current) => Books.setItems(current, []),
            }),
            commands: [SearchAnnasArchive({ query })],
          }
    },

    SucceededSearch: ({ query, results }) =>
      isCurrentSearch(model, query)
        ? {
            model: modifyFields(model, {
              search: () => SearchState.Done({ query }),
              results: (current) => Books.setItems(current, results),
            }),
          }
        : { model },

    FailedSearch: ({ query, reason }) =>
      isCurrentSearch(model, query)
        ? {
            model: modifyFields(model, {
              search: () => SearchState.Failed({ query, reason }),
              results: (current) => Books.setItems(current, []),
            }),
          }
        : { model },

    GotResultsMessage: ({ message }) => ({
      model: modifyFields(model, { results: (current) => Books.update(current, message) }),
    }),

    GotFolderMessage: ({ message }) => foldFolder(model, message),

    GotDownloadDialogMessage: ({ message }) => foldDialog(model, message),

    ClickedDownload: () =>
      selectedCount(model) === 0 || model.isStartingDownload || model.downloadDialog.isOpen
        ? { model }
        : Update.combine(modifyFields(model, { folder: FolderSelect.clearInput }), [
            foldRefreshFolders,
            foldDialogOpen,
          ]),

    ConfirmedDownload: () => {
      const items = Books.selectedItems(model.results)

      if (Arr.isReadonlyArrayEmpty(items) || model.isStartingDownload || isFolderUnsettled(model)) {
        return { model }
      }

      const chosen = FolderSelect.requestFor(model.folder)

      return Update.combine(modifyFields(model, { isStartingDownload: () => true }), [
        foldDialogClose,
        (stepModel) => ({
          model: stepModel,
          commands: [
            StartAnnasDownload({
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
        results: Books.clearSelection,
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

// VIEW

const bannerClass = "island-shell rounded-2xl p-4 text-sm"

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  const count = selectedCount(model)

  const body: ReadonlyArray<Html> = SearchState.match<ReadonlyArray<Html>>(model.search, {
    Idle: () => [h.p([h.Class("text-sm text-secondary")], ["Search for a book to get started."])],
    Searching: () => [],
    Failed: ({ reason }) => [
      h.div([h.Role("alert"), h.Class(`${bannerClass} border-red-200 text-red-600`)], [reason]),
    ],
    Done: ({ query }) =>
      Arr.isReadonlyArrayEmpty(model.results.items)
        ? [h.p([h.Class("text-sm text-secondary")], [`No results for "${query}".`])]
        : [],
  })

  return h.main(
    [h.Class("page-wrap flex flex-col gap-6 pb-8 pt-8 sm:px-4")],
    [
      pageHeader(h, {
        numeral: "I",
        label: "Anna's Archive",
        title: "Books",
        ...(model.search._tag === "Done" ? { meta: `${model.results.items.length} results` } : {}),
      }),
      h.section(
        [],
        [
          searchForm(h, {
            inputId: SEARCH_INPUT_ID,
            value: model.queryInput,
            label: "Search for a book",
            placeholder: "Search for a book...",
            isSearching: isSearching(model),
            onInput: (value) => Message.ChangedQuery({ value }),
            onSubmit: Message.SubmittedSearch(),
          }),
        ],
      ),
      ...body,
      h.submodel({
        slotId: "annas-results",
        model: model.results,
        view: Books.view,
        viewInputs: { idPrefix: "annas" },
        toParentMessage: (message) => Message.GotResultsMessage({ message }),
      }),
      downloadBar(h, {
        selectedCount: count,
        isStarting: model.isStartingDownload,
        onClick: Message.ClickedDownload(),
      }),
      h.submodel({
        slotId: model.downloadDialog.id,
        model: model.downloadDialog,
        view: Dialog.view,
        viewInputs: {
          toView: downloadDialogView(h, {
            count,
            folder: model.folder,
            toFolderMessage: (message) => Message.GotFolderMessage({ message }),
            onConfirm: Message.ConfirmedDownload(),
            isConfirmDisabled: isFolderUnsettled(model),
          }),
        },
        toParentMessage: (message) => Message.GotDownloadDialogMessage({ message }),
      }),
    ],
  )
})
