import {
  type Watch,
  type WatchAlert,
  WatchAlertId,
  WatchAlertSchema,
  WatchId,
  WatchSchema,
  alertToProwlarrResult,
} from "@inkpipe/shared"
import { Array as Arr, Duration, Effect, Option, Schema, Stream } from "effect"
import { AsyncData, Command, Submodel, Subscription, Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, callApi } from "./api"
import { STARTED_TOAST_DESCRIPTION, requestDownload, startedToastTitle } from "./downloadRequest"
import { safeDecode } from "./folderSelect"
import { pageHeader } from "./pageHeader"
import { formatSize } from "./results"
import { ToastRequest, toast } from "./toast"
import * as WatchForm from "./watchForm"

export const POLL_INTERVAL = Duration.seconds(60)

// MODEL

const AlertAction = Schema.Literals(["Acknowledge", "Download", "Save"])
type AlertAction = typeof AlertAction.Type

const WatchData = AsyncData.Schema(WatchSchema, Schema.String)
const AlertsData = AsyncData.Schema(Schema.Array(WatchAlertSchema), Schema.String)

export const Model = Schema.Struct({
  /** The watch being shown: answers for any other watch are ignored. */
  maybeWatchId: Schema.Option(WatchId),
  watch: WatchData.schema,
  alerts: AlertsData.schema,
  form: WatchForm.Model,
  /** On screen: only then are the alerts polled. */
  isActive: Schema.Boolean,
  /** Bumped per request, so only the latest answer is applied. */
  watchSeq: Schema.Int,
  alertsSeq: Schema.Int,
  /** Alerts with an action in flight (their buttons are held), and which action. */
  busy: Schema.Array(Schema.Struct({ alertId: WatchAlertId, action: AlertAction })),
  isAcknowledgingAll: Schema.Boolean,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  SucceededFetchWatch: { watchId: WatchId, seq: Schema.Int, watch: WatchSchema },
  FailedFetchWatch: { watchId: WatchId, seq: Schema.Int, reason: Schema.String },
  SucceededFetchAlerts: {
    watchId: WatchId,
    seq: Schema.Int,
    alerts: Schema.Array(WatchAlertSchema),
  },
  FailedFetchAlerts: { watchId: WatchId, seq: Schema.Int, reason: Schema.String },
  TickedPoll: {},
  GotFormMessage: { message: WatchForm.Message },
  ClickedEdit: {},
  ClickedAcknowledge: { alertId: WatchAlertId },
  SucceededAcknowledge: { watchId: WatchId, alertId: WatchAlertId },
  FailedAcknowledge: { watchId: WatchId, alertId: WatchAlertId, reason: Schema.String },
  ClickedAcknowledgeAll: {},
  SucceededAcknowledgeAll: { watchId: WatchId },
  FailedAcknowledgeAll: { watchId: WatchId, reason: Schema.String },
  ClickedDownload: { alertId: WatchAlertId },
  SucceededDownload: { watchId: WatchId, alertId: WatchAlertId, started: Schema.Finite },
  FailedDownload: { watchId: WatchId, alertId: WatchAlertId, reason: Schema.String },
  ClickedSaveMagnet: { alertId: WatchAlertId },
  SucceededSaveMagnet: { watchId: WatchId, alertId: WatchAlertId },
  FailedSaveMagnet: { watchId: WatchId, alertId: WatchAlertId, reason: Schema.String },
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  RequestedToast: { request: ToastRequest },
  /** Unread alerts may have changed: the sidebar badge should refresh (and say why, if asked). */
  ChangedAlerts: { maybeToast: Schema.Option(ToastRequest) },
})
export type OutMessage = typeof OutMessage.Type

// COMMAND

export const FetchWatch = Command.define("FetchWatch", {
  args: { watchId: WatchId, seq: Schema.Int },
  messages: [Message.SucceededFetchWatch, Message.FailedFetchWatch],
  execute: ({ watchId, seq }) =>
    callApi((client) => client.watches.get({ params: { id: watchId } })).pipe(
      Effect.match({
        onSuccess: (watch) => Message.SucceededFetchWatch({ watchId, seq, watch }),
        onFailure: ({ message }) => Message.FailedFetchWatch({ watchId, seq, reason: message }),
      }),
    ),
})

export const FetchAlerts = Command.define("FetchAlerts", {
  args: { watchId: WatchId, seq: Schema.Int },
  messages: [Message.SucceededFetchAlerts, Message.FailedFetchAlerts],
  execute: ({ watchId, seq }) =>
    callApi((client) => client.watches.listAlerts({ params: { id: watchId } })).pipe(
      Effect.match({
        onSuccess: ({ alerts }) => Message.SucceededFetchAlerts({ watchId, seq, alerts }),
        onFailure: ({ message }) => Message.FailedFetchAlerts({ watchId, seq, reason: message }),
      }),
    ),
})

/** Marking an alert handled after its action worked is best effort: the action already happened. */
const acknowledgeQuietly = (watchId: WatchId, alertId: WatchAlertId) =>
  callApi((client) => client.watches.acknowledgeAlert({ params: { id: watchId, alertId } })).pipe(
    Effect.ignore,
  )

export const AcknowledgeAlert = Command.define("AcknowledgeAlert", {
  args: { watchId: WatchId, alertId: WatchAlertId },
  messages: [Message.SucceededAcknowledge, Message.FailedAcknowledge],
  execute: ({ watchId, alertId }) =>
    callApi((client) => client.watches.acknowledgeAlert({ params: { id: watchId, alertId } })).pipe(
      Effect.match({
        onSuccess: () => Message.SucceededAcknowledge({ watchId, alertId }),
        onFailure: ({ message }) =>
          Message.FailedAcknowledge({ watchId, alertId, reason: message }),
      }),
    ),
})

export const AcknowledgeAllAlerts = Command.define("AcknowledgeAllAlerts", {
  args: { watchId: WatchId },
  messages: [Message.SucceededAcknowledgeAll, Message.FailedAcknowledgeAll],
  execute: ({ watchId }) =>
    callApi((client) => client.watches.acknowledgeAllAlerts({ params: { id: watchId } })).pipe(
      Effect.match({
        onSuccess: () => Message.SucceededAcknowledgeAll({ watchId }),
        onFailure: ({ message }) => Message.FailedAcknowledgeAll({ watchId, reason: message }),
      }),
    ),
})

export const DownloadAlert = Command.define("DownloadAlert", {
  args: { watchId: WatchId, alert: WatchAlertSchema, subfolder: Schema.String },
  messages: [Message.SucceededDownload, Message.FailedDownload],
  execute: ({ watchId, alert, subfolder }) =>
    requestDownload([alertToProwlarrResult(alert)], Option.some(subfolder), Option.none()).pipe(
      Effect.tap(() => acknowledgeQuietly(watchId, alert.id)),
      Effect.match({
        onSuccess: ({ started }) =>
          Message.SucceededDownload({ watchId, alertId: alert.id, started }),
        onFailure: ({ message }) =>
          Message.FailedDownload({ watchId, alertId: alert.id, reason: message }),
      }),
    ),
})

export const SaveAlertMagnet = Command.define("SaveAlertMagnet", {
  args: { watchId: WatchId, alert: WatchAlertSchema },
  messages: [Message.SucceededSaveMagnet, Message.FailedSaveMagnet],
  execute: ({ watchId, alert }) =>
    callApi((client) =>
      client.alldebrid.saveMagnet({
        payload: { magnetUrl: alert.magnetUrl, downloadUrl: alert.downloadUrl },
      }),
    ).pipe(
      Effect.tap(() => acknowledgeQuietly(watchId, alert.id)),
      Effect.match({
        onSuccess: () => Message.SucceededSaveMagnet({ watchId, alertId: alert.id }),
        onFailure: ({ message }) =>
          Message.FailedSaveMagnet({ watchId, alertId: alert.id, reason: message }),
      }),
    ),
})

// PURE HELPERS

/** Book watches (a folder assigned) go through the full pipeline into that folder. */
export const bookFolder = (watch: Watch): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(watch.subfolder), (folder) => folder.length > 0)

/** Without a link there's nothing to hand to AllDebrid. */
export const hasLink = (alert: WatchAlert): boolean =>
  (alert.magnetUrl ?? "").length > 0 || (alert.downloadUrl ?? "").length > 0

export const unacknowledgedCount = (alerts: ReadonlyArray<WatchAlert>): number =>
  alerts.filter((alert) => !alert.acknowledged).length

export const alertsLabel = (count: number): string => `${count} alerts`

const isCurrent = (model: Model, watchId: WatchId): boolean =>
  Option.exists(model.maybeWatchId, (id) => id === watchId)

const alertsOf = (model: Model): ReadonlyArray<WatchAlert> =>
  Option.getOrElse(AsyncData.getData(model.alerts), () => [])

const findAlert = (model: Model, alertId: WatchAlertId): Option.Option<WatchAlert> =>
  Arr.findFirst(alertsOf(model), (alert) => alert.id === alertId)

export const isAlertBusy = (model: Model, alertId: WatchAlertId): boolean =>
  model.busy.some((entry) => entry.alertId === alertId)

const markBusy = (model: Model, alertId: WatchAlertId, action: AlertAction): Model =>
  modifyFields(model, { busy: (entries) => [...entries, { alertId, action }] })

const release = (model: Model, alertId: WatchAlertId): Model =>
  modifyFields(model, { busy: (entries) => entries.filter((entry) => entry.alertId !== alertId) })

// INIT

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, ApiClientService>

export const init = (): Model => ({
  maybeWatchId: Option.none(),
  watch: WatchData.Idle(),
  alerts: AlertsData.Idle(),
  form: WatchForm.init(),
  isActive: false,
  watchSeq: 0,
  alertsSeq: 0,
  busy: [],
  isAcknowledgingAll: false,
})

// UPDATE

const toastOut = (request: ToastRequest) => OutMessage.RequestedToast({ request })

const changedAlerts = (maybeToast: Option.Option<ToastRequest>) =>
  OutMessage.ChangedAlerts({ maybeToast })

/** Start loading the watch. Each request gets a fresh sequence number. */
const reloadWatch = (model: Model, watchId: WatchId): UpdateReturn => {
  const seq = model.watchSeq + 1

  return {
    model: modifyFields(model, {
      watchSeq: () => seq,
      watch: (watch) => Option.getOrElse(AsyncData.revalidateOrLoad(watch), () => watch),
    }),
    commands: [FetchWatch({ watchId, seq })],
  }
}

const reloadAlerts = (model: Model, watchId: WatchId): UpdateReturn => {
  const seq = model.alertsSeq + 1

  return {
    model: modifyFields(model, {
      alertsSeq: () => seq,
      alerts: (alerts) => Option.getOrElse(AsyncData.revalidateOrLoad(alerts), () => alerts),
    }),
    commands: [FetchAlerts({ watchId, seq })],
  }
}

/**
 * Entering the page (or moving to another watch): forget the previous watch
 * and load this one. Counters keep climbing so answers still in flight for
 * the previous visit can never match.
 */
export const enter = (model: Model, watchId: WatchId): UpdateReturn => {
  const fresh: Model = {
    ...init(),
    // An open edit dialog belongs to the previous watch: don't carry it over.
    form: Option.exists(model.maybeWatchId, (id) => id === watchId) ? model.form : WatchForm.init(),
    maybeWatchId: Option.some(watchId),
    isActive: true,
    watchSeq: model.watchSeq,
    alertsSeq: model.alertsSeq,
  }

  const watchStep = reloadWatch(fresh, watchId)
  const alertsStep = reloadAlerts(watchStep.model, watchId)

  return {
    model: alertsStep.model,
    commands: [...(watchStep.commands ?? []), ...(alertsStep.commands ?? [])],
  }
}

/** Leaving the page: stop polling. */
export const leave = (model: Model): UpdateReturn => ({
  model: modifyFields(model, { isActive: () => false }),
})

// A saved watch: tell the user, and reload it to show the change.
const foldFormOutMessage = WatchForm.OutMessage.match<
  Update.StepWithOutMessage<Model, Message, OutMessage, ApiClientService>
>({
  SavedWatch:
    ({ mode }) =>
    (model) => ({
      ...Option.match(model.maybeWatchId, {
        onNone: () => ({ model }),
        onSome: (watchId) => reloadWatch(model, watchId),
      }),
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

const openEdit = (model: Model, watch: Watch): UpdateReturn =>
  Update.foldChildStep({
    update: (form: WatchForm.Model) => WatchForm.openForEdit(form, watch),
    read: (parent: Model) => Option.some(parent.form),
    write: (parent, form) => modifyFields(parent, { form: () => form }),
    toParentMessage: (message) => Message.GotFormMessage({ message }),
  })(model)

/** Start an action on one alert, unless one is already running for it. */
const actOnAlert = (
  model: Model,
  alertId: WatchAlertId,
  action: AlertAction,
  command: Command.Command<Message, never, ApiClientService>,
): UpdateReturn =>
  isAlertBusy(model, alertId)
    ? { model }
    : { model: markBusy(model, alertId, action), commands: [command] }

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    SucceededFetchWatch: ({ watchId, seq, watch }) =>
      isCurrent(model, watchId) && seq === model.watchSeq
        ? { model: modifyFields(model, { watch: () => WatchData.Success({ data: watch }) }) }
        : { model },

    FailedFetchWatch: ({ watchId, seq, reason }) =>
      isCurrent(model, watchId) && seq === model.watchSeq
        ? {
            model: modifyFields(model, {
              watch: (watch) =>
                Option.match(AsyncData.getData(watch), {
                  onNone: () => WatchData.Failure({ error: reason }),
                  onSome: (data) => WatchData.Stale({ error: reason, data }),
                }),
            }),
          }
        : { model },

    SucceededFetchAlerts: ({ watchId, seq, alerts }) =>
      isCurrent(model, watchId) && seq === model.alertsSeq
        ? { model: modifyFields(model, { alerts: () => AlertsData.Success({ data: alerts }) }) }
        : { model },

    FailedFetchAlerts: ({ watchId, seq, reason }) =>
      isCurrent(model, watchId) && seq === model.alertsSeq
        ? {
            model: modifyFields(model, {
              alerts: (alerts) =>
                Option.match(AsyncData.getData(alerts), {
                  onNone: () => AlertsData.Failure({ error: reason }),
                  onSome: (data) => AlertsData.Stale({ error: reason, data }),
                }),
            }),
          }
        : { model },

    TickedPoll: () =>
      model.isActive && !AsyncData.isPending(model.alerts)
        ? Option.match(model.maybeWatchId, {
            onNone: () => ({ model }),
            onSome: (watchId) => reloadAlerts(model, watchId),
          })
        : { model },

    GotFormMessage: ({ message }) => foldForm(model, message),

    ClickedEdit: () =>
      Option.match(AsyncData.getData(model.watch), {
        onNone: () => ({ model }),
        onSome: (watch) => openEdit(model, watch),
      }),

    ClickedAcknowledge: ({ alertId }) =>
      Option.match(model.maybeWatchId, {
        onNone: () => ({ model }),
        onSome: (watchId) =>
          actOnAlert(model, alertId, "Acknowledge", AcknowledgeAlert({ watchId, alertId })),
      }),
    SucceededAcknowledge: ({ watchId, alertId }) =>
      isCurrent(model, watchId)
        ? {
            ...reloadAlerts(release(model, alertId), watchId),
            outMessage: changedAlerts(Option.none()),
          }
        : { model, outMessage: changedAlerts(Option.none()) },
    FailedAcknowledge: ({ watchId, alertId, reason }) => ({
      model: isCurrent(model, watchId) ? release(model, alertId) : model,
      outMessage: toastOut(toast.error("Failed to acknowledge alert", reason)),
    }),

    ClickedAcknowledgeAll: () =>
      model.isAcknowledgingAll
        ? { model }
        : Option.match(model.maybeWatchId, {
            onNone: () => ({ model }),
            onSome: (watchId) => ({
              model: modifyFields(model, { isAcknowledgingAll: () => true }),
              commands: [AcknowledgeAllAlerts({ watchId })],
            }),
          }),
    SucceededAcknowledgeAll: ({ watchId }) => {
      const done = isCurrent(model, watchId)
        ? reloadAlerts(modifyFields(model, { isAcknowledgingAll: () => false }), watchId)
        : { model }

      return {
        ...done,
        outMessage: changedAlerts(Option.some(toast.success("All alerts acknowledged"))),
      }
    },
    FailedAcknowledgeAll: ({ watchId, reason }) => ({
      model: isCurrent(model, watchId)
        ? modifyFields(model, { isAcknowledgingAll: () => false })
        : model,
      outMessage: toastOut(toast.error("Failed to acknowledge alerts", reason)),
    }),

    ClickedDownload: ({ alertId }) =>
      Option.match(
        Option.all({
          watchId: model.maybeWatchId,
          alert: findAlert(model, alertId),
          subfolder: Option.flatMap(AsyncData.getData(model.watch), bookFolder),
        }),
        {
          onNone: () => ({ model }),
          onSome: ({ watchId, alert, subfolder }) =>
            actOnAlert(model, alertId, "Download", DownloadAlert({ watchId, alert, subfolder })),
        },
      ),
    SucceededDownload: ({ watchId, alertId, started }) => ({
      ...(isCurrent(model, watchId) ? reloadAlerts(release(model, alertId), watchId) : { model }),
      outMessage: changedAlerts(
        Option.some(toast.success(startedToastTitle(started), STARTED_TOAST_DESCRIPTION)),
      ),
    }),
    FailedDownload: ({ watchId, alertId, reason }) => ({
      model: isCurrent(model, watchId) ? release(model, alertId) : model,
      outMessage: toastOut(toast.error("Failed to start download", reason)),
    }),

    ClickedSaveMagnet: ({ alertId }) =>
      Option.match(Option.all({ watchId: model.maybeWatchId, alert: findAlert(model, alertId) }), {
        onNone: () => ({ model }),
        onSome: ({ watchId, alert }) =>
          hasLink(alert)
            ? actOnAlert(model, alertId, "Save", SaveAlertMagnet({ watchId, alert }))
            : { model },
      }),
    SucceededSaveMagnet: ({ watchId, alertId }) => ({
      ...(isCurrent(model, watchId) ? reloadAlerts(release(model, alertId), watchId) : { model }),
      outMessage: changedAlerts(Option.some(toast.success("Saved to AllDebrid"))),
    }),
    FailedSaveMagnet: ({ watchId, alertId, reason }) => ({
      model: isCurrent(model, watchId) ? release(model, alertId) : model,
      outMessage: toastOut(toast.error("Failed to save to AllDebrid", reason)),
    }),
  })

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  pollAlerts: entry(
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

const errorBox = "island-shell mb-6 rounded-2xl border-red-200 p-4 text-sm text-red-600"
const codeClass = "rounded bg-surface px-1.5 py-0.5 text-xs"
const editButtonClass =
  "rounded-lg px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-surface"
const alertButtonClass =
  "rounded-lg px-2 py-1 text-xs transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-50"

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  const alerts = alertsOf(model)
  const unread = unacknowledgedCount(alerts)
  const maybeWatch = AsyncData.getData(model.watch)
  const folder = Option.flatMap(maybeWatch, bookFolder)

  const filterChips = (watch: Watch): ReadonlyArray<Html> =>
    watch.filterGroups.flatMap((group, groupIndex) => [
      ...(groupIndex > 0
        ? [h.span([h.Class("text-[10px] font-bold tracking-wide text-secondary")], ["AND"])]
        : []),
      h.span(
        [
          h.DataAttribute("filter-group", String(groupIndex)),
          h.Class(
            "rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-secondary",
          ),
          ...(group.substrings.length > 1
            ? [
                h.Title(
                  group.mode === "AND"
                    ? "Every substring below must be present"
                    : "Any one substring below is enough",
                ),
              ]
            : []),
        ],
        [
          `${group.substrings.length > 1 ? `${group.mode === "AND" ? "ALL" : "ANY"} of: ` : ""}${group.substrings.join(group.mode === "AND" ? " + " : " / ")}`,
        ],
      ),
    ])

  const watchSection = (watch: Watch): Html =>
    h.div(
      [h.Class("mb-6 flex flex-wrap items-center justify-between gap-3")],
      [
        h.div(
          [],
          [
            h.p(
              [h.DataAttribute("watch-summary", ""), h.Class("mt-1 text-sm text-secondary")],
              [
                "Query: ",
                h.code([h.Class(codeClass)], [watch.query]),
                ` · Every ${watch.intervalSeconds}s · `,
                h.span(
                  [
                    h.DataAttribute("status", watch.enabled ? "active" : "paused"),
                    h.Class(watch.enabled ? "text-green-600" : "text-gray-400"),
                  ],
                  [watch.enabled ? "Active" : "Paused"],
                ),
                " · ",
                ...Option.match(bookFolder(watch), {
                  onNone: () => ["Saves matches to AllDebrid"],
                  onSome: (name) => [
                    "Downloads to ",
                    h.code([h.Class(codeClass)], [safeDecode(name)]),
                  ],
                }),
              ],
            ),
            ...(watch.filterGroups.length > 0
              ? [
                  h.div(
                    [h.Class("mt-2 flex flex-wrap items-center gap-1.5")],
                    [...filterChips(watch)],
                  ),
                ]
              : []),
          ],
        ),
        h.button(
          [h.Type("button"), h.OnClick(Message.ClickedEdit()), h.Class(editButtonClass)],
          ["Edit"],
        ),
      ],
    )

  const alertRow = (alert: WatchAlert): Html => {
    const busy = isAlertBusy(model, alert.id)

    return h.keyed("div")(
      String(alert.id),
      [
        h.DataAttribute("alert", String(alert.id)),
        h.Class(
          `island-shell flex flex-col gap-2 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between ${alert.acknowledged ? "opacity-50" : ""}`,
        ),
      ],
      [
        h.div(
          [h.Class("min-w-0 flex-1")],
          [
            h.p([h.Class("break-words text-sm text-primary")], [alert.title]),
            h.p(
              [h.Class("mt-0.5 text-xs text-secondary")],
              [
                `${alert.indexer} · ${alert.seeders} seeders · ${formatSize(alert.size)} · ${new Date(alert.matchedAt).toLocaleString()}`,
              ],
            ),
          ],
        ),
        h.div(
          [h.Class("flex items-center gap-2 sm:ml-3 sm:shrink-0")],
          [
            ...Option.match(folder, {
              onSome: () => [
                h.button(
                  [
                    h.Type("button"),
                    h.Disabled(busy),
                    h.DataAttribute("action", "download"),
                    h.OnClick(Message.ClickedDownload({ alertId: alert.id })),
                    h.Class(`${alertButtonClass} text-accent`),
                  ],
                  ["Download"],
                ),
              ],
              onNone: () => [
                h.button(
                  [
                    h.Type("button"),
                    h.Disabled(busy || !hasLink(alert)),
                    h.DataAttribute("action", "save-magnet"),
                    h.OnClick(Message.ClickedSaveMagnet({ alertId: alert.id })),
                    h.Class(`${alertButtonClass} text-accent`),
                    ...(hasLink(alert)
                      ? []
                      : [h.Title("No magnet or download URL for this alert")]),
                  ],
                  ["Save to Magnet"],
                ),
              ],
            }),
            ...(alert.acknowledged
              ? []
              : [
                  h.button(
                    [
                      h.Type("button"),
                      h.Disabled(busy),
                      h.DataAttribute("action", "acknowledge"),
                      h.OnClick(Message.ClickedAcknowledge({ alertId: alert.id })),
                      h.Class(`${alertButtonClass} text-secondary`),
                    ],
                    ["Acknowledge"],
                  ),
                ]),
          ],
        ),
      ],
    )
  }

  const staleNotice = (
    what: string,
    state: AsyncData.AsyncData<unknown, string>,
  ): ReadonlyArray<Html> =>
    AsyncData.isStale(state)
      ? [
          h.div(
            [h.Role("alert"), h.Class(errorBox)],
            [`Couldn't refresh ${what}: ${Option.getOrElse(AsyncData.getError(state), () => "")}`],
          ),
        ]
      : []

  return h.main(
    [h.Class("page-wrap pb-8 pt-8 sm:px-4")],
    [
      pageHeader(h, {
        numeral: "IV",
        label: "Watches",
        title: Option.match(maybeWatch, { onNone: () => "Watch", onSome: (watch) => watch.name }),
        ...(AsyncData.hasData(model.alerts) ? { meta: alertsLabel(alerts.length) } : {}),
      }),
      h.div(
        [h.Class("mb-6 flex items-center gap-3")],
        [
          h.a(
            [h.Href("/watches"), h.Class("text-sm text-secondary no-underline hover:text-primary")],
            ["← Back"],
          ),
        ],
      ),
      ...AsyncData.matchData(model.watch, {
        onEmpty: () => [
          h.p([h.Role("status"), h.Class("text-sm text-secondary")], ["Loading watch..."]),
        ],
        onFailure: (reason) => [
          h.div([h.Role("alert"), h.Class(errorBox)], [`Failed to load watch: ${reason}`]),
        ],
        onData: (watch) => [...staleNotice("watch", model.watch), watchSection(watch)],
      }),
      h.div(
        [h.Class("mb-4 flex items-center justify-between")],
        [
          h.h2(
            [h.Class("text-lg font-semibold text-primary")],
            [
              "Alerts",
              ...(unread > 0
                ? [
                    h.span(
                      [
                        h.DataAttribute("unread", ""),
                        h.Class("ml-2 text-sm font-normal text-accent"),
                      ],
                      [`(${unread} new)`],
                    ),
                  ]
                : []),
            ],
          ),
          ...(unread > 0
            ? [
                h.button(
                  [
                    h.Type("button"),
                    h.Disabled(model.isAcknowledgingAll),
                    h.DataAttribute("action", "acknowledge-all"),
                    h.OnClick(Message.ClickedAcknowledgeAll()),
                    h.Class("text-xs text-accent hover:text-accent-hover disabled:opacity-50"),
                  ],
                  ["Acknowledge All"],
                ),
              ]
            : []),
        ],
      ),
      ...AsyncData.matchData(model.alerts, {
        onEmpty: () => [
          h.p([h.Role("status"), h.Class("text-sm text-secondary")], ["Loading alerts..."]),
        ],
        onFailure: (reason) => [
          h.div([h.Role("alert"), h.Class(errorBox)], [`Failed to load alerts: ${reason}`]),
        ],
        onData: () => [
          ...staleNotice("alerts", model.alerts),
          ...(Arr.isReadonlyArrayEmpty(alerts)
            ? [
                h.div(
                  [h.Class("blank-page flex flex-col items-center gap-3 p-8 text-center")],
                  [
                    h.div([h.Class("blank-page-icon")]),
                    h.p([h.Class("font-display text-lg italic text-primary")], ["No alerts yet"]),
                    h.p(
                      [h.Class("text-sm text-secondary")],
                      ["Alerts appear here when new Prowlarr results match your filters."],
                    ),
                  ],
                ),
              ]
            : [h.div([h.Class("space-y-2")], alerts.map(alertRow))]),
        ],
      }),
      h.submodel({
        slotId: "watch-detail-form",
        model: model.form,
        view: WatchForm.view,
        toParentMessage: (message) => Message.GotFormMessage({ message }),
      }),
    ],
  )
})
