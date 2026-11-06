import { Dialog } from "@foldkit/ui"
import {
  CreateWatchRequestSchema,
  type FilterGroup,
  FilterGroupModeSchema,
  FilterGroupSchema,
  type Watch,
  WatchId,
} from "@inkpipe/shared"
import { Array as Arr, Effect, Option, Schema, String as Str } from "effect"
import { Command, Submodel, Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, callApi } from "./api"
import * as FilterGroups from "./filterGroups"
import * as FolderSelect from "./folderSelect"
import { buttonClass, textField } from "./form"

export const DEFAULT_INTERVAL_SECONDS = 3600
export const MIN_INTERVAL_SECONDS = 300

// MODEL

export const Mode = defineTaggedUnion({
  Create: {},
  Edit: { watchId: WatchId },
})
export type Mode = typeof Mode.Type

export const Model = Schema.Struct({
  dialog: Dialog.Model,
  mode: Mode,
  name: Schema.String,
  query: Schema.String,
  intervalText: Schema.String,
  filterGroups: Schema.Array(FilterGroupSchema),
  folder: FolderSelect.Model,
  isSaving: Schema.Boolean,
  /** Save failures are shown inside the dialog: a toast would be unreachable behind it. */
  maybeError: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ChangedName: { value: Schema.String },
  ChangedQuery: { value: Schema.String },
  ChangedInterval: { value: Schema.String },
  GotFolderMessage: { message: FolderSelect.Message },
  GotDialogMessage: { message: Dialog.Message },
  ClickedAddGroup: {},
  ClickedRemoveGroup: { groupIndex: Schema.Int },
  ChangedGroupMode: { groupIndex: Schema.Int, mode: FilterGroupModeSchema },
  ChangedSubstring: { groupIndex: Schema.Int, substringIndex: Schema.Int, value: Schema.String },
  ClickedAddSubstring: { groupIndex: Schema.Int },
  ClickedRemoveSubstring: { groupIndex: Schema.Int, substringIndex: Schema.Int },
  ClickedSave: {},
  SucceededSave: {},
  FailedSave: { reason: Schema.String },
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  /** The server accepted the watch; the dialog has been closed. */
  SavedWatch: { mode: Mode },
})
export type OutMessage = typeof OutMessage.Type

// PURE HELPERS

/** What the interval box means: a number, at least 5 minutes, defaulting to an hour. */
export const parseInterval = (text: string): number => {
  const parsed = Number(Str.trim(text))

  return Math.max(
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_SECONDS,
    MIN_INTERVAL_SECONDS,
  )
}

const SavePayload = CreateWatchRequestSchema

/** The request body for the current form, or `None` while name or query is blank. */
export const buildPayload = (model: Model): Option.Option<typeof SavePayload.Type> => {
  const name = Str.trim(model.name)
  const query = Str.trim(model.query)

  return name === "" || query === ""
    ? Option.none()
    : Option.some({
        name,
        query,
        intervalSeconds: parseInterval(model.intervalText),
        filterGroups: FilterGroups.cleanGroups(model.filterGroups),
        subfolder: Option.getOrNull(
          Option.map(FolderSelect.selection(model.folder), ({ subfolder }) => subfolder),
        ),
      })
}

/** A typed folder name is only trustworthy once the existing folders are known. */
export const isFolderUnsettled = (model: Model): boolean =>
  FolderSelect.isPending(model.folder) && Option.isSome(FolderSelect.selection(model.folder))

export const canSave = (model: Model): boolean =>
  Option.isSome(buildPayload(model)) && !model.isSaving && !isFolderUnsettled(model)

// COMMAND

export const CreateWatch = Command.define("CreateWatch", {
  args: { payload: SavePayload },
  messages: [Message.SucceededSave, Message.FailedSave],
  execute: ({ payload }) =>
    callApi((client) => client.watches.create({ payload })).pipe(
      Effect.match({
        onSuccess: () => Message.SucceededSave(),
        onFailure: ({ message }) => Message.FailedSave({ reason: message }),
      }),
    ),
})

export const UpdateWatch = Command.define("UpdateWatch", {
  args: { watchId: WatchId, payload: SavePayload },
  messages: [Message.SucceededSave, Message.FailedSave],
  execute: ({ watchId, payload }) =>
    callApi((client) => client.watches.update({ params: { id: watchId }, payload })).pipe(
      Effect.match({
        onSuccess: () => Message.SucceededSave(),
        onFailure: ({ message }) => Message.FailedSave({ reason: message }),
      }),
    ),
})

// INIT

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, ApiClientService>

const blank = (dialog: Dialog.Model): Model => ({
  dialog,
  mode: Mode.Create(),
  name: "",
  query: "",
  intervalText: String(DEFAULT_INTERVAL_SECONDS),
  filterGroups: [],
  folder: FolderSelect.initial(),
  isSaving: false,
  maybeError: Option.none(),
})

export const init = (): Model => blank(Dialog.init({ id: "watch-form-dialog" }))

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
  read: (model: Model) => Option.some(model.dialog),
  write: (model: Model, dialog: Dialog.Model) => modifyFields(model, { dialog: () => dialog }),
  toParentMessage: (message: Dialog.Message) => Message.GotDialogMessage({ message }),
  foldOutMessage: foldDialogOutMessage,
}

const foldDialog = Update.foldChild({ update: Dialog.update, ...dialogFold })
const foldDialogOpen = Update.foldChildStep({ update: Dialog.open, ...dialogFold })
const foldDialogClose = Update.foldChildStep({ update: Dialog.close, ...dialogFold })

const openWith = (fresh: Model): Update.Return<Model, Message, ApiClientService> =>
  Update.combine(fresh, [foldRefreshFolders, foldDialogOpen])

/** Open an empty form for a new watch. */
export const openForCreate = (model: Model): Update.Return<Model, Message, ApiClientService> =>
  openWith(blank(model.dialog))

/** Open the form filled in with `watch`. */
export const openForEdit = (
  model: Model,
  watch: Watch,
): Update.Return<Model, Message, ApiClientService> =>
  openWith({
    ...blank(model.dialog),
    mode: Mode.Edit({ watchId: watch.id }),
    name: watch.name,
    query: watch.query,
    intervalText: String(watch.intervalSeconds),
    filterGroups: watch.filterGroups,
    folder: FolderSelect.initial(watch.subfolder ?? ""),
  })

const editGroups = (
  model: Model,
  change: (groups: ReadonlyArray<FilterGroup>) => ReadonlyArray<FilterGroup>,
): UpdateReturn => ({ model: modifyFields(model, { filterGroups: change }) })

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ChangedName: ({ value }) => ({ model: modifyFields(model, { name: () => value }) }),
    ChangedQuery: ({ value }) => ({ model: modifyFields(model, { query: () => value }) }),
    ChangedInterval: ({ value }) => ({ model: modifyFields(model, { intervalText: () => value }) }),

    GotFolderMessage: ({ message }) => foldFolder(model, message),
    GotDialogMessage: ({ message }) => foldDialog(model, message),

    ClickedAddGroup: () => editGroups(model, FilterGroups.addGroup),
    ClickedRemoveGroup: ({ groupIndex }) =>
      editGroups(model, (groups) => FilterGroups.removeGroup(groups, groupIndex)),
    ChangedGroupMode: ({ groupIndex, mode }) =>
      editGroups(model, (groups) => FilterGroups.setMode(groups, groupIndex, mode)),
    ChangedSubstring: ({ groupIndex, substringIndex, value }) =>
      editGroups(model, (groups) =>
        FilterGroups.setSubstring(groups, groupIndex, substringIndex, value),
      ),
    ClickedAddSubstring: ({ groupIndex }) =>
      editGroups(model, (groups) => FilterGroups.addSubstring(groups, groupIndex)),
    ClickedRemoveSubstring: ({ groupIndex, substringIndex }) =>
      editGroups(model, (groups) =>
        FilterGroups.removeSubstring(groups, groupIndex, substringIndex),
      ),

    ClickedSave: () => {
      if (!canSave(model)) {
        return { model }
      }

      return Option.match(buildPayload(model), {
        onNone: () => ({ model }),
        onSome: (payload) => ({
          model: modifyFields(model, { isSaving: () => true, maybeError: () => Option.none() }),
          commands: [
            model.mode._tag === "Edit"
              ? UpdateWatch({ watchId: model.mode.watchId, payload })
              : CreateWatch({ payload }),
          ],
        }),
      })
    },

    // Close first, so the parent's toast isn't raised behind a modal.
    SucceededSave: () => ({
      ...Update.combine(modifyFields(model, { isSaving: () => false }), [foldDialogClose]),
      outMessage: OutMessage.SavedWatch({ mode: model.mode }),
    }),

    FailedSave: ({ reason }) => ({
      model: modifyFields(model, { isSaving: () => false, maybeError: () => Option.some(reason) }),
    }),
  })

// VIEW

const smallLink = "text-xs text-accent hover:text-accent-hover"
const smallDanger = "text-xs text-red-500 hover:text-red-700"

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  const isEdit = model.mode._tag === "Edit"

  const modeButton = (
    groupIndex: number,
    group: FilterGroup,
    mode: "AND" | "OR",
    text: string,
    hint: string,
    extra: string,
  ): Html =>
    h.button(
      [
        h.Type("button"),
        h.Title(hint),
        h.AriaPressed(group.mode === mode ? "true" : "false"),
        h.OnClick(Message.ChangedGroupMode({ groupIndex, mode })),
        h.Class(
          `px-2 py-1 text-xs transition ${extra} ${group.mode === mode ? "bg-accent text-on-accent" : "bg-surface-hover text-secondary hover:text-primary"}`,
        ),
      ],
      [text],
    )

  const groupView = (group: FilterGroup, groupIndex: number): Html =>
    h.div(
      [],
      [
        ...(groupIndex > 0
          ? [
              h.div(
                [h.Class("flex items-center justify-center py-1.5")],
                [
                  h.span(
                    [
                      h.Class(
                        "rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-bold tracking-wide text-secondary",
                      ),
                    ],
                    ["AND"],
                  ),
                ],
              ),
            ]
          : []),
        h.div(
          [
            h.DataAttribute("group", String(groupIndex)),
            h.Class("space-y-2 rounded-xl border border-border p-3"),
          ],
          [
            h.div(
              [h.Class("flex items-center justify-between gap-2")],
              [
                h.div(
                  [h.Class("flex items-center gap-2")],
                  [
                    h.span([h.Class("text-xs text-secondary")], [`Group ${groupIndex + 1}`]),
                    ...(group.substrings.length > 1
                      ? [
                          h.div(
                            [
                              h.Class(
                                "flex items-center overflow-hidden rounded-lg border border-border",
                              ),
                            ],
                            [
                              modeButton(
                                groupIndex,
                                group,
                                "AND",
                                "Match ALL",
                                "Every substring in this group must be present",
                                "",
                              ),
                              modeButton(
                                groupIndex,
                                group,
                                "OR",
                                "Match ANY",
                                "Any one substring in this group is enough",
                                "border-l border-border",
                              ),
                            ],
                          ),
                        ]
                      : []),
                  ],
                ),
                h.button(
                  [
                    h.Type("button"),
                    h.AriaLabel(`Remove group ${groupIndex + 1}`),
                    h.OnClick(Message.ClickedRemoveGroup({ groupIndex })),
                    h.Class(smallDanger),
                  ],
                  ["Remove"],
                ),
              ],
            ),
            ...group.substrings.map((substring, substringIndex) =>
              h.div(
                [h.Class("flex items-center gap-2")],
                [
                  h.span(
                    [h.Class("w-7 shrink-0 text-center text-[10px] font-semibold text-secondary")],
                    [substringIndex > 0 ? group.mode : ""],
                  ),
                  h.input([
                    h.Type("text"),
                    h.Value(substring),
                    h.AriaLabel(`Group ${groupIndex + 1}, substring ${substringIndex + 1}`),
                    h.Placeholder("string to match..."),
                    h.OnInput((value) =>
                      Message.ChangedSubstring({ groupIndex, substringIndex, value }),
                    ),
                    h.Class(
                      "w-full flex-1 rounded-[3px] border border-border bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-secondary focus:border-accent focus:outline-none",
                    ),
                  ]),
                  ...(group.substrings.length > 1
                    ? [
                        h.button(
                          [
                            h.Type("button"),
                            h.AriaLabel(
                              `Remove substring ${substringIndex + 1} from group ${groupIndex + 1}`,
                            ),
                            h.OnClick(
                              Message.ClickedRemoveSubstring({ groupIndex, substringIndex }),
                            ),
                            h.Class(`${smallDanger} px-1`),
                          ],
                          ["✕"],
                        ),
                      ]
                    : []),
                ],
              ),
            ),
            h.button(
              [
                h.Type("button"),
                h.OnClick(Message.ClickedAddSubstring({ groupIndex })),
                h.Class(smallLink),
              ],
              ["+ Add substring"],
            ),
          ],
        ),
      ],
    )

  const dialogView = ({
    dialog,
    backdrop,
    panel,
    title,
    description,
    closeButton,
    isVisible,
  }: Dialog.RenderInfo): Html =>
    h.dialog(
      [...dialog],
      isVisible
        ? [
            h.div([...backdrop, h.Class("fixed inset-0 z-50 bg-black/50")]),
            h.div(
              [h.Class("fixed inset-0 z-50 flex items-center justify-center p-4")],
              [
                h.div(
                  [
                    ...panel,
                    h.Class(
                      "island-shell max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-surface p-4",
                    ),
                  ],
                  [
                    h.h2(
                      [...title, h.Class("text-lg font-bold text-primary")],
                      [isEdit ? "Edit Watch" : "Create Watch"],
                    ),
                    h.p(
                      [...description, h.Class("mb-4 text-sm text-secondary")],
                      ["Set up a recurring Prowlarr search with title filters."],
                    ),
                    h.div(
                      [h.Class("space-y-4")],
                      [
                        textField(h, {
                          id: "watch-name",
                          label: "Name",
                          value: model.name,
                          placeholder: "One Piece - Digital Color",
                          onInput: (value) => Message.ChangedName({ value }),
                        }),
                        textField(h, {
                          id: "watch-query",
                          label: "Prowlarr Query",
                          value: model.query,
                          placeholder: "one piece",
                          onInput: (value) => Message.ChangedQuery({ value }),
                        }),
                        textField(h, {
                          id: "watch-interval",
                          label: "Interval (seconds, min 300)",
                          type: "number",
                          value: model.intervalText,
                          placeholder: "3600",
                          onInput: (value) => Message.ChangedInterval({ value }),
                        }),
                        h.div(
                          [],
                          [
                            h.submodel({
                              slotId: "watch-folder",
                              model: model.folder,
                              view: FolderSelect.view,
                              viewInputs: {
                                idPrefix: "watch-folder",
                                label: "Subfolder",
                                placeholder: "e.g. manga/action or leave empty",
                              },
                              toParentMessage: (message) => Message.GotFolderMessage({ message }),
                            }),
                            h.p(
                              [h.Class("mt-1 text-xs text-secondary")],
                              [
                                "Set a folder to download and convert matches into it. Leave empty to just save matches to AllDebrid instead.",
                              ],
                            ),
                          ],
                        ),
                        h.div(
                          [h.Class("space-y-3")],
                          [
                            h.div(
                              [h.Class("flex items-center justify-between")],
                              [
                                h.span(
                                  [h.Class("text-sm font-medium text-primary")],
                                  ["Title Filters"],
                                ),
                                h.button(
                                  [
                                    h.Type("button"),
                                    h.OnClick(Message.ClickedAddGroup()),
                                    h.Class(smallLink),
                                  ],
                                  ["+ Add Group"],
                                ),
                              ],
                            ),
                            ...(Arr.isReadonlyArrayEmpty(model.filterGroups)
                              ? [
                                  h.p(
                                    [h.Class("text-xs text-secondary")],
                                    ["No filters applied — all results for this query will match."],
                                  ),
                                ]
                              : []),
                            ...(model.filterGroups.length > 1
                              ? [
                                  h.p(
                                    [h.Class("text-xs text-secondary")],
                                    [
                                      "A result must match every group below (groups are always combined with AND).",
                                    ],
                                  ),
                                ]
                              : []),
                            ...model.filterGroups.map(groupView),
                          ],
                        ),
                      ],
                    ),
                    ...Option.match(model.maybeError, {
                      onNone: () => [],
                      onSome: (reason) => [
                        h.p(
                          [h.Role("alert"), h.Class("mt-4 text-sm text-red-600")],
                          [`Failed to ${isEdit ? "update" : "create"} watch: ${reason}`],
                        ),
                      ],
                    }),
                    h.div(
                      [h.Class("mt-6 flex justify-end gap-3")],
                      [
                        h.button([...closeButton, h.Class(buttonClass.secondary)], ["Cancel"]),
                        h.button(
                          [
                            h.Type("button"),
                            h.Disabled(!canSave(model)),
                            h.OnClick(Message.ClickedSave()),
                            h.Class(buttonClass.primary),
                          ],
                          [model.isSaving ? "Saving..." : isEdit ? "Save Changes" : "Create Watch"],
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ]
        : [],
    )

  return h.submodel({
    slotId: model.dialog.id,
    model: model.dialog,
    view: Dialog.view,
    viewInputs: { toView: dialogView },
    toParentMessage: (message) => Message.GotDialogMessage({ message }),
  })
})
