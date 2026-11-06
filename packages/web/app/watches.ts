import { type Watch, WatchId, WatchSchema } from "@inkpipe/shared"
import { Array as Arr, Duration, Effect, Option, Schema, Stream } from "effect"
import { AsyncData, Command, Submodel, Subscription, Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, callApi } from "./api"
import { buttonClass } from "./form"
import { pageHeader } from "./pageHeader"
import { ToastRequest, toast } from "./toast"
import * as Push from "./push"
import * as WatchForm from "./watchForm"

export const POLL_INTERVAL = Duration.seconds(30)

// MODEL

const BusyAction = Schema.Literals(["Dismiss", "Run", "Toggle", "Delete"])
type BusyAction = typeof BusyAction.Type

const WatchesData = AsyncData.Schema(Schema.Array(WatchSchema), Schema.String)

export const Model = Schema.Struct({
  watches: WatchesData.schema,
  form: WatchForm.Model,
  push: Push.Model,
  /** On screen: only then is the list polled. */
  isActive: Schema.Boolean,
  /** Watches with an action in flight (their buttons are held), and which action. */
  busy: Schema.Array(Schema.Struct({ watchId: WatchId, action: BusyAction })),
  /** Bumped per list request, so only the latest answer is applied. */
  fetchSeq: Schema.Int,
  /** Which watch is showing its "really delete?" question. */
  maybeConfirmingDeleteId: Schema.Option(WatchId),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  SucceededFetchWatches: { seq: Schema.Int, watches: Schema.Array(WatchSchema) },
  FailedFetchWatches: { seq: Schema.Int, reason: Schema.String },
  TickedPoll: {},
  GotFormMessage: { message: WatchForm.Message },
  GotPushMessage: { message: Push.Message },
  ClickedNewWatch: {},
  ClickedDismiss: { watchId: WatchId },
  SucceededDismiss: { watchId: WatchId },
  FailedDismiss: { watchId: WatchId, reason: Schema.String },
  ClickedRunNow: { watchId: WatchId },
  SucceededRunNow: { watchId: WatchId, matches: Schema.Finite },
  FailedRunNow: { watchId: WatchId, reason: Schema.String },
  ClickedToggle: { watchId: WatchId, enabled: Schema.Boolean },
  SucceededToggle: { watchId: WatchId },
  FailedToggle: { watchId: WatchId, reason: Schema.String },
  ClickedDelete: { watchId: WatchId },
  ClickedCancelDelete: {},
  ClickedConfirmDelete: { watchId: WatchId },
  SucceededDelete: { watchId: WatchId },
  FailedDelete: { watchId: WatchId, reason: Schema.String },
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  RequestedToast: { request: ToastRequest },
  /** Unread alerts may have changed: the sidebar badge should refresh (and say why, if asked). */
  ChangedAlerts: { maybeToast: Schema.Option(ToastRequest) },
})
export type OutMessage = typeof OutMessage.Type

// COMMAND

export const FetchWatches = Command.define("FetchWatches", {
  args: { seq: Schema.Int },
  messages: [Message.SucceededFetchWatches, Message.FailedFetchWatches],
  execute: ({ seq }) =>
    callApi((client) => client.watches.list()).pipe(
      Effect.match({
        onSuccess: ({ watches }) => Message.SucceededFetchWatches({ seq, watches }),
        onFailure: ({ message }) => Message.FailedFetchWatches({ seq, reason: message }),
      }),
    ),
})

export const DismissAlerts = Command.define("DismissAlerts", {
  args: { watchId: WatchId },
  messages: [Message.SucceededDismiss, Message.FailedDismiss],
  execute: ({ watchId }) =>
    callApi((client) => client.watches.acknowledgeAllAlerts({ params: { id: watchId } })).pipe(
      Effect.match({
        onSuccess: () => Message.SucceededDismiss({ watchId }),
        onFailure: ({ message }) => Message.FailedDismiss({ watchId, reason: message }),
      }),
    ),
})

export const RunWatch = Command.define("RunWatch", {
  args: { watchId: WatchId },
  messages: [Message.SucceededRunNow, Message.FailedRunNow],
  execute: ({ watchId }) =>
    callApi((client) => client.watches.trigger({ params: { id: watchId } })).pipe(
      Effect.match({
        onSuccess: ({ matches }) => Message.SucceededRunNow({ watchId, matches }),
        onFailure: ({ message }) => Message.FailedRunNow({ watchId, reason: message }),
      }),
    ),
})

export const SetWatchEnabled = Command.define("SetWatchEnabled", {
  args: { watchId: WatchId, enabled: Schema.Boolean },
  messages: [Message.SucceededToggle, Message.FailedToggle],
  execute: ({ watchId, enabled }) =>
    callApi((client) =>
      client.watches.update({ params: { id: watchId }, payload: { enabled } }),
    ).pipe(
      Effect.match({
        onSuccess: () => Message.SucceededToggle({ watchId }),
        onFailure: ({ message }) => Message.FailedToggle({ watchId, reason: message }),
      }),
    ),
})

export const DeleteWatch = Command.define("DeleteWatch", {
  args: { watchId: WatchId },
  messages: [Message.SucceededDelete, Message.FailedDelete],
  execute: ({ watchId }) =>
    callApi((client) => client.watches.delete({ params: { id: watchId } })).pipe(
      Effect.match({
        onSuccess: () => Message.SucceededDelete({ watchId }),
        onFailure: ({ message }) => Message.FailedDelete({ watchId, reason: message }),
      }),
    ),
})

// PURE HELPERS

export const watchCountLabel = (count: number): string => `${count} watch${count === 1 ? "" : "es"}`

export const matchesToastTitle = (matches: number): string =>
  matches === 0 ? "No new matches found" : `${matches} new match${matches === 1 ? "" : "es"} found`

export const unreadOf = (watch: Watch): number => watch.unreadCount ?? 0

export const isBusy = (model: Model, watchId: number): boolean =>
  model.busy.some((entry) => entry.watchId === watchId)

export const busyAction = (model: Model, watchId: number): Option.Option<BusyAction> =>
  Option.map(
    Arr.findFirst(model.busy, (entry) => entry.watchId === watchId),
    ({ action }) => action,
  )

const markBusy = (model: Model, watchId: WatchId, action: BusyAction): Model =>
  modifyFields(model, {
    busy: (entries) =>
      entries.some((entry) => entry.watchId === watchId)
        ? entries
        : [...entries, { watchId, action }],
  })

const release = (model: Model, watchId: number): Model =>
  modifyFields(model, { busy: (entries) => entries.filter((entry) => entry.watchId !== watchId) })

// INIT

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, ApiClientService>

export const init = (): Model => ({
  watches: WatchesData.Idle(),
  form: WatchForm.init(),
  push: Push.init(),
  isActive: false,
  busy: [],
  fetchSeq: 0,
  maybeConfirmingDeleteId: Option.none(),
})

// UPDATE

const toastOut = (request: ToastRequest) => OutMessage.RequestedToast({ request })

const markReloading = (model: Model): Model =>
  modifyFields(model, {
    watches: (watches) => Option.getOrElse(AsyncData.revalidateOrLoad(watches), () => watches),
  })

/**
 * Start a (re)load. Each request gets a fresh sequence number, and only the
 * latest one's answer is applied, so an older answer can't overwrite newer data.
 */
const reload = (model: Model): UpdateReturn => {
  const seq = model.fetchSeq + 1

  return {
    model: modifyFields(markReloading(model), { fetchSeq: () => seq }),
    commands: [FetchWatches({ seq })],
  }
}

/** Entering the page: show it, and (re)load the list. */
export const enter = (model: Model): UpdateReturn => {
  const loading = reload(model)

  return Update.combine(modifyFields(loading.model, { isActive: () => true }), [
    (stepModel) => ({ model: stepModel, commands: loading.commands }),
    foldPushRefresh,
  ])
}

/** Leaving the page: stop polling. */
export const leave = (model: Model): UpdateReturn => ({
  model: modifyFields(model, { isActive: () => false }),
})

// A saved watch: tell the user, and reload the list to show it.
const foldFormOutMessage = WatchForm.OutMessage.match<
  Update.StepWithOutMessage<Model, Message, OutMessage, ApiClientService>
>({
  SavedWatch:
    ({ mode }) =>
    (model) => ({
      ...reload(model),
      outMessage: toastOut(
        toast.success(
          mode._tag === "Create" ? "Watch created" : "Watch updated. Restart scheduled.",
        ),
      ),
    }),
})

const foldForm = Update.foldChild({
  update: WatchForm.update,
  read: (model: Model) => Option.some(model.form),
  write: (model, form) => modifyFields(model, { form: () => form }),
  toParentMessage: (message) => Message.GotFormMessage({ message }),
  foldOutMessage: foldFormOutMessage,
})

const foldPush = Update.foldChild({
  update: Push.update,
  read: (model: Model) => Option.some(model.push),
  write: (model, push) => modifyFields(model, { push: () => push }),
  toParentMessage: (message) => Message.GotPushMessage({ message }),
})

const foldPushRefresh = Update.foldChildStep({
  update: Push.refresh,
  read: (model: Model) => Option.some(model.push),
  write: (model, push) => modifyFields(model, { push: () => push }),
  toParentMessage: (message) => Message.GotPushMessage({ message }),
})

const foldOpenCreate = Update.foldChildStep({
  update: WatchForm.openForCreate,
  read: (model: Model) => Option.some(model.form),
  write: (model, form) => modifyFields(model, { form: () => form }),
  toParentMessage: (message) => Message.GotFormMessage({ message }),
})

const act = (
  model: Model,
  watchId: WatchId,
  action: BusyAction,
  command: Command.Command<Message, never, ApiClientService>,
): UpdateReturn =>
  isBusy(model, watchId)
    ? { model }
    : { model: markBusy(model, watchId, action), commands: [command] }

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    SucceededFetchWatches: ({ seq, watches }) =>
      seq === model.fetchSeq
        ? { model: modifyFields(model, { watches: () => WatchesData.Success({ data: watches }) }) }
        : { model },

    FailedFetchWatches: ({ seq, reason }) =>
      seq === model.fetchSeq
        ? {
            model: modifyFields(model, {
              watches: (watches) =>
                Option.match(AsyncData.getData(watches), {
                  onNone: () => WatchesData.Failure({ error: reason }),
                  onSome: (data) => WatchesData.Stale({ error: reason, data }),
                }),
            }),
          }
        : { model },

    TickedPoll: () =>
      model.isActive && !AsyncData.isPending(model.watches) ? reload(model) : { model },

    GotFormMessage: ({ message }) => foldForm(model, message),
    GotPushMessage: ({ message }) => foldPush(model, message),
    ClickedNewWatch: () => foldOpenCreate(model),

    ClickedDismiss: ({ watchId }) => act(model, watchId, "Dismiss", DismissAlerts({ watchId })),
    SucceededDismiss: ({ watchId }) => ({
      ...reload(release(model, watchId)),
      outMessage: OutMessage.ChangedAlerts({ maybeToast: Option.none() }),
    }),
    FailedDismiss: ({ watchId, reason }) => ({
      model: release(model, watchId),
      outMessage: toastOut(toast.error("Failed to dismiss alerts", reason)),
    }),

    ClickedRunNow: ({ watchId }) => act(model, watchId, "Run", RunWatch({ watchId })),
    // New matches mean new alerts, so the sidebar badge is out of date too.
    SucceededRunNow: ({ watchId, matches }) => ({
      ...reload(release(model, watchId)),
      outMessage:
        matches > 0
          ? OutMessage.ChangedAlerts({
              maybeToast: Option.some(toast.success(matchesToastTitle(matches))),
            })
          : toastOut(toast.success(matchesToastTitle(matches))),
    }),
    FailedRunNow: ({ watchId, reason }) => ({
      model: release(model, watchId),
      outMessage: toastOut(toast.error("Failed to trigger watch", reason)),
    }),

    ClickedToggle: ({ watchId, enabled }) =>
      act(model, watchId, "Toggle", SetWatchEnabled({ watchId, enabled })),
    SucceededToggle: ({ watchId }) => reload(release(model, watchId)),
    FailedToggle: ({ watchId, reason }) => ({
      model: release(model, watchId),
      outMessage: toastOut(toast.error("Failed to update watch", reason)),
    }),

    ClickedDelete: ({ watchId }) => ({
      model: modifyFields(model, { maybeConfirmingDeleteId: () => Option.some(watchId) }),
    }),
    ClickedCancelDelete: () => ({
      model: modifyFields(model, { maybeConfirmingDeleteId: () => Option.none() }),
    }),
    ClickedConfirmDelete: ({ watchId }) =>
      Option.exists(model.maybeConfirmingDeleteId, (id) => id === watchId)
        ? act(
            modifyFields(model, { maybeConfirmingDeleteId: () => Option.none() }),
            watchId,
            "Delete",
            DeleteWatch({ watchId }),
          )
        : { model },
    SucceededDelete: ({ watchId }) => ({
      ...reload(release(model, watchId)),
      outMessage: OutMessage.ChangedAlerts({
        maybeToast: Option.some(toast.success("Watch deleted")),
      }),
    }),
    FailedDelete: ({ watchId, reason }) => ({
      model: release(model, watchId),
      outMessage: toastOut(toast.error("Failed to delete watch", reason)),
    }),
  })

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  pollWatches: entry(
    { isActive: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isActive: model.isActive }),
      dependenciesToStream: ({ isActive }) =>
        Stream.when(
          Stream.tick(POLL_INTERVAL).pipe(
            Stream.drop(1),
            Stream.map(() => Message.TickedPoll()),
          ),
          Effect.sync(() => isActive),
        ),
    },
  ),
}))

// VIEW

const actionClass =
  "rounded-lg px-2 py-1 text-xs transition-colors hover:bg-surface disabled:opacity-50"

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  const list = Option.getOrElse(AsyncData.getData(model.watches), () => [])

  const card = (watch: Watch): Html => {
    const busy = isBusy(model, watch.id)
    const unread = unreadOf(watch)
    const confirming = Option.exists(model.maybeConfirmingDeleteId, (id) => id === watch.id)

    return h.keyed("div")(
      String(watch.id),
      [
        h.DataAttribute("watch", String(watch.id)),
        h.Class(
          "island-shell relative flex flex-col gap-3 rounded-2xl p-4 hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between",
        ),
      ],
      [
        h.div(
          [h.Class("min-w-0 flex-1")],
          [
            h.div(
              [h.Class("flex flex-wrap items-center gap-2")],
              [
                h.a(
                  [
                    h.Href(`/watches/${watch.id}`),
                    h.Class(
                      "break-words text-sm font-semibold text-primary no-underline after:absolute after:inset-0",
                    ),
                  ],
                  [watch.name],
                ),
                h.span(
                  [
                    h.DataAttribute("status", watch.enabled ? "active" : "paused"),
                    h.Class(
                      `rounded-full px-1.5 py-0.5 text-xs ${watch.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`,
                    ),
                  ],
                  [watch.enabled ? "Active" : "Paused"],
                ),
                ...(unread > 0
                  ? [
                      h.span(
                        [
                          h.DataAttribute("unread", ""),
                          h.Class(
                            "rounded-full bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent",
                          ),
                        ],
                        [`${unread} new`],
                      ),
                    ]
                  : []),
              ],
            ),
            h.p(
              [h.Class("mt-0.5 truncate text-xs text-secondary")],
              [
                `Query: ${watch.query} · Every ${watch.intervalSeconds}s${
                  watch.filterGroups.length > 0
                    ? ` · ${watch.filterGroups.length} filter group${watch.filterGroups.length === 1 ? "" : "s"}`
                    : ""
                }`,
              ],
            ),
          ],
        ),
        h.div(
          [h.Class("relative z-10 flex flex-wrap items-center gap-2 sm:ml-3 sm:shrink-0")],
          confirming
            ? [
                h.span(
                  [h.Role("alert"), h.Class("text-xs text-secondary")],
                  [`Delete "${watch.name}" and all its alerts?`],
                ),
                h.button(
                  [
                    h.Type("button"),
                    h.DataAttribute("action", "confirm-delete"),
                    h.OnClick(Message.ClickedConfirmDelete({ watchId: watch.id })),
                    h.Class(`${actionClass} text-red-500`),
                  ],
                  ["Delete"],
                ),
                h.button(
                  [
                    h.Type("button"),
                    h.DataAttribute("action", "keep"),
                    h.OnClick(Message.ClickedCancelDelete()),
                    h.Class(`${actionClass} text-secondary`),
                  ],
                  ["Keep"],
                ),
              ]
            : [
                ...(unread > 0
                  ? [
                      h.button(
                        [
                          h.Type("button"),
                          h.Disabled(busy),
                          h.DataAttribute("action", "dismiss"),
                          h.OnClick(Message.ClickedDismiss({ watchId: watch.id })),
                          h.Class(`${actionClass} text-secondary`),
                        ],
                        ["Dismiss"],
                      ),
                    ]
                  : []),
                h.button(
                  [
                    h.Type("button"),
                    h.Disabled(busy),
                    h.DataAttribute("action", "run"),
                    h.OnClick(Message.ClickedRunNow({ watchId: watch.id })),
                    h.Class(`${actionClass} text-accent`),
                  ],
                  [
                    Option.exists(busyAction(model, watch.id), (action) => action === "Run")
                      ? "Running..."
                      : "Run Now",
                  ],
                ),
                h.button(
                  [
                    h.Type("button"),
                    h.Disabled(busy),
                    h.DataAttribute("action", "toggle"),
                    h.OnClick(
                      Message.ClickedToggle({ watchId: watch.id, enabled: !watch.enabled }),
                    ),
                    h.Class(`${actionClass} text-secondary`),
                  ],
                  [watch.enabled ? "Pause" : "Resume"],
                ),
                h.button(
                  [
                    h.Type("button"),
                    h.Disabled(busy),
                    h.DataAttribute("action", "delete"),
                    h.OnClick(Message.ClickedDelete({ watchId: watch.id })),
                    h.Class(`${actionClass} text-red-500`),
                  ],
                  ["Delete"],
                ),
              ],
        ),
      ],
    )
  }

  return h.main(
    [h.Class("page-wrap pb-8 pt-8 sm:px-4")],
    [
      pageHeader(h, {
        numeral: "IV",
        label: "Watches",
        title: "Watches",
        ...(AsyncData.hasData(model.watches) ? { meta: watchCountLabel(list.length) } : {}),
      }),
      h.div(
        [h.Class("mb-6 flex items-center justify-end")],
        [
          h.button(
            [h.Type("button"), h.OnClick(Message.ClickedNewWatch()), h.Class(buttonClass.primary)],
            ["+ New Watch"],
          ),
        ],
      ),
      h.submodel({
        slotId: "watches-push",
        model: model.push,
        view: Push.view,
        toParentMessage: (message) => Message.GotPushMessage({ message }),
      }),
      ...AsyncData.matchData(model.watches, {
        onEmpty: () => [
          h.p([h.Role("status"), h.Class("text-sm text-secondary")], ["Loading watches..."]),
        ],
        onFailure: (reason) => [
          h.div(
            [
              h.Role("alert"),
              h.Class("island-shell mb-6 rounded-2xl border-red-200 p-4 text-sm text-red-600"),
            ],
            [`Failed to load watches: ${reason}`],
          ),
        ],
        onData: () => [
          ...(AsyncData.isStale(model.watches)
            ? [
                h.div(
                  [
                    h.Role("alert"),
                    h.Class(
                      "island-shell mb-6 rounded-2xl border-red-200 p-4 text-sm text-red-600",
                    ),
                  ],
                  [
                    `Couldn't refresh watches: ${Option.getOrElse(AsyncData.getError(model.watches), () => "")}`,
                  ],
                ),
              ]
            : []),
          ...(Arr.isReadonlyArrayEmpty(list)
            ? [
                h.div(
                  [h.Class("blank-page flex flex-col items-center gap-3 p-8 text-center")],
                  [
                    h.div([h.Class("blank-page-icon")]),
                    h.p([h.Class("font-display text-lg italic text-primary")], ["No watches yet"]),
                    h.p(
                      [h.Class("text-sm text-secondary")],
                      ["Create one to monitor Prowlarr for new content."],
                    ),
                  ],
                ),
              ]
            : [h.div([h.Class("space-y-3")], list.map(card))]),
        ],
      }),
      h.submodel({
        slotId: "watch-form",
        model: model.form,
        view: WatchForm.view,
        toParentMessage: (message) => Message.GotFormMessage({ message }),
      }),
    ],
  )
})
