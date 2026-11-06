import { Array as Arr, Effect, Option, Schema, String as Str } from "effect"
import { AsyncData, Command, Submodel, type Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"
import { Input } from "@foldkit/ui"

import { type ApiClientService, callApi } from "./api"
import { inputClass, labelClass } from "./form"

// A Copyparty subfolder picker: free text with the existing folders offered as
// suggestions. Typing a name that doesn't exist means "create it".

// MODEL

const FoldersData = AsyncData.Schema(Schema.Array(Schema.String), Schema.String)

export const Model = Schema.Struct({
  folders: FoldersData.schema,
  /** What the user typed or picked, shown decoded. */
  input: Schema.String,
})
export type Model = typeof Model.Type

/** The value to send with a download or watch, if any folder is chosen. */
export type Selection = Readonly<{ subfolder: string; isNewFolder: boolean }>

// MESSAGE

export const Message = defineMessageUnion({
  SucceededFetchFolders: { folders: Schema.Array(Schema.String) },
  FailedFetchFolders: { reason: Schema.String },
  ChangedInput: { value: Schema.String },
})
export type Message = typeof Message.Type

// PURE HELPERS

const decode = Option.liftThrowable(decodeURIComponent)

/**
 * Folder names from Copyparty are URI-encoded; a raw name the user typed may
 * hold a lone "%" that `decodeURIComponent` rejects, so fall back to as-is.
 */
export const safeDecode = (value: string): string => Option.getOrElse(decode(value), () => value)

const SLASHES = /^\/+|\/+$/g

/** What the user means: no outer spaces or slashes, one unicode form. */
export const normalizeName = (input: string): string =>
  Str.trim(input).replace(SLASHES, "").normalize("NFC")

/**
 * The existing folder (still URI-encoded) that `input` names. An exact match
 * wins, so `manga` picks `manga` even when `Manga` also exists; otherwise the
 * case-insensitive match is used.
 */
export const findExisting = (
  folders: ReadonlyArray<string>,
  input: string,
): Option.Option<string> => {
  const wanted = normalizeName(input)
  const decoded = (folder: string) => normalizeName(safeDecode(folder))

  return Option.orElse(
    Arr.findFirst(folders, (folder) => decoded(folder) === wanted),
    () =>
      Arr.findFirst(
        folders,
        (folder) => Str.toLowerCase(decoded(folder)) === Str.toLowerCase(wanted),
      ),
  )
}

/** A fetch is in flight, so the list may not yet reflect what exists. */
export const isPending = (model: Model): boolean => AsyncData.isPending(model.folders)

/** Whether the folder list is known, so "new" is a fact rather than a guess. */
export const isListKnown = (model: Model): boolean => AsyncData.hasData(model.folders)

export const selection = (model: Model): Option.Option<Selection> => {
  const typed = normalizeName(model.input)

  if (typed === "") {
    return Option.none()
  }

  const folders = Option.getOrElse(AsyncData.getData(model.folders), () => [])

  return Option.match(findExisting(folders, typed), {
    onNone: () => Option.some({ subfolder: typed, isNewFolder: true }),
    onSome: (existing) => Option.some({ subfolder: existing, isNewFolder: false }),
  })
}

// COMMAND

export const FetchFolders = Command.define("FetchFolders", {
  messages: [Message.SucceededFetchFolders, Message.FailedFetchFolders],
  execute: callApi((client) => client.copyparty.listFolders()).pipe(
    Effect.match({
      onSuccess: ({ folders }) => Message.SucceededFetchFolders({ folders }),
      onFailure: ({ message }) => Message.FailedFetchFolders({ reason: message }),
    }),
  ),
})

// INIT

type UpdateReturn = Update.Return<Model, Message, ApiClientService>

/**
 * Nothing fetched yet. Pickers that live in a dialog start here and call
 * `refresh` when the dialog opens. `value` pre-fills the box (an existing,
 * possibly URI-encoded, subfolder).
 */
export const initial = (value = ""): Model => ({
  folders: FoldersData.Idle(),
  input: safeDecode(value),
})

/** A picker that is visible straight away: starts fetching immediately. */
export const init = (value = ""): UpdateReturn => ({
  model: { folders: FoldersData.Loading(), input: safeDecode(value) },
  commands: [FetchFolders()],
})

// UPDATE

/** Re-fetch, so folders created since the last time this was shown appear. */
export const refresh = (model: Model): UpdateReturn =>
  Option.match(AsyncData.revalidateOrLoad(model.folders), {
    onNone: () => ({ model }),
    onSome: (folders) => ({
      model: modifyFields(model, { folders: () => folders }),
      commands: [FetchFolders()],
    }),
  })

/** Clear what's typed (a fresh dialog should not remember the last folder). */
export const clearInput = (model: Model): Model => modifyFields(model, { input: () => "" })

/**
 * What to tell the server about the chosen folder. "New" is only claimed when
 * the existing folders are actually known: a wrong "new" makes the server
 * create (and, if a later item fails, delete) a folder that already exists.
 * With an unknown list the folder is sent without any claim.
 */
export const requestFor = (
  model: Model,
): Option.Option<{ subfolder: string; newFolder: Option.Option<boolean> }> =>
  Option.map(selection(model), ({ subfolder, isNewFolder }) => ({
    subfolder,
    newFolder: isListKnown(model) ? Option.some(isNewFolder) : Option.none(),
  }))

/** Replace what's typed, e.g. when a form is reopened for a different item. */
export const setValue = (model: Model, value: string): Model =>
  modifyFields(model, { input: () => safeDecode(value) })

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    SucceededFetchFolders: ({ folders }) => ({
      model: modifyFields(model, { folders: () => FoldersData.Success({ data: folders }) }),
    }),

    // A failed refresh keeps the folders we already know, marked stale.
    FailedFetchFolders: ({ reason }) => ({
      model: modifyFields(model, {
        folders: (folders) =>
          Option.match(AsyncData.getData(folders), {
            onNone: () => FoldersData.Failure({ error: reason }),
            onSome: (data) => FoldersData.Stale({ error: reason, data }),
          }),
      }),
    }),

    ChangedInput: ({ value }) => ({ model: modifyFields(model, { input: () => value }) }),
  })

// VIEW

export type ViewInputs = Readonly<{
  idPrefix: string
  label: string
  placeholder: string
}>

export const view = Submodel.defineView<Model, Message, ViewInputs>(
  (model, { idPrefix, label, placeholder }, h): Html => {
    const listId = `${idPrefix}-suggestions`
    const folders = Option.getOrElse(AsyncData.getData(model.folders), () => [])
    const chosen = selection(model)

    const listStatus = AsyncData.match(model.folders, {
      onIdle: () => Option.none<string>(),
      onLoading: () => Option.some("Loading existing folders…"),
      onRefreshing: () => Option.none<string>(),
      onFailure: () => Option.some("Couldn't load existing folders — you can still type a name."),
      onStale: () => Option.none<string>(),
      onSuccess: (data) =>
        Arr.isReadonlyArrayEmpty(data)
          ? Option.some("No existing subfolders — type a new name to create one.")
          : Option.none<string>(),
    })

    const creationNote = Option.flatMap(chosen, ({ subfolder, isNewFolder }) =>
      !isNewFolder
        ? Option.none<string>()
        : Option.some(
            isListKnown(model)
              ? `"${subfolder}" will be created.`
              : `"${subfolder}" will be created if it doesn't already exist.`,
          ),
    )

    const notes = Arr.getSomes([listStatus, creationNote])

    return h.div(
      [h.Class("space-y-2")],
      [
        Input.view(
          {
            id: `${idPrefix}-input`,
            value: model.input,
            onInput: (value) => Message.ChangedInput({ value }),
            placeholder,
            hasDescription: true,
            toView: ({ input, label: labelAttrs, description }) =>
              h.div(
                [],
                [
                  h.label(
                    [...labelAttrs, h.Class(labelClass)],
                    [
                      label,
                      h.span([h.Class("font-normal normal-case text-primary/60")], [" (optional)"]),
                    ],
                  ),
                  h.input([...input, h.List(listId), h.Class(inputClass)]),
                  h.datalist(
                    [h.Id(listId)],
                    folders.map((folder) => h.option([h.Value(safeDecode(folder))])),
                  ),
                  // One region that is always mounted, so changes are announced.
                  h.div(
                    [
                      ...description,
                      h.Role("status"),
                      h.Class("mt-1 space-y-1 text-xs text-primary/60"),
                    ],
                    notes.map((note) => h.p([], [note])),
                  ),
                ],
              ),
          },
          h,
        ),
      ],
    )
  },
)
