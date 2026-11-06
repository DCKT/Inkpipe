import { Dialog, Progress } from "@foldkit/ui"
import { type Job, JobSchema, type JobsSocketEvent, JobsSocketEventSchema } from "@inkpipe/shared"
import { Clock, Duration, Effect, Option, Queue, Schema, Stream, pipe } from "effect"
import { Command, Dom, Submodel, Subscription, Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, bases, callApi } from "./api"

export const POLL_INTERVAL = Duration.seconds(15)
export const RECONNECT_DELAY = Duration.seconds(3)
export const CLOCK_INTERVAL = Duration.seconds(1)
export const JOBS_SOCKET_PATH = "/api/jobs/ws"
export const CLEAN_BUTTON_ID = "jobs-clean"
export const CONFIRM_CLEAN_BUTTON_ID = "jobs-clean-confirm"

// MODEL

const ClearStatus = Schema.Option(
  Schema.Struct({ kind: Schema.Literals(["success", "error"]), text: Schema.String }),
)

export const Model = Schema.Struct({
  jobs: Schema.Array(JobSchema),
  drawer: Dialog.Model,
  /** Two-step "Clean" so a stray click doesn't wipe history (replaces `confirm()`). */
  isConfirmingClear: Schema.Boolean,
  isClearing: Schema.Boolean,
  maybeClearStatus: ClearStatus,
  /**
   * Bumped by every socket frame. A poll started before a newer frame arrived
   * is stale and must not clobber it, so results carry the epoch they began at.
   */
  socketEpoch: Schema.Int,
  /** Wall clock, ticked while the drawer is open, so `view` stays pure. */
  nowMillis: Schema.Finite,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  GotDrawerMessage: { message: Dialog.Message },
  ClickedToggleDrawer: {},
  ReceivedSocketEvent: { event: JobsSocketEventSchema },
  TickedPoll: {},
  /** `None` when the poll failed: keep what we have. */
  CompletedFetchJobs: { epoch: Schema.Int, maybeJobs: Schema.Option(Schema.Array(JobSchema)) },
  CompletedFocus: {},
  TickedClock: { nowMillis: Schema.Finite },
  ClickedClean: {},
  ClickedCancelClean: {},
  ClickedConfirmClean: {},
  SucceededClearJobs: { deleted: Schema.Finite },
  FailedClearJobs: { reason: Schema.String },
})
export type Message = typeof Message.Type

// PURE HELPERS

export const isActiveJob = (job: Job): boolean => job.stage !== "DONE" && job.stage !== "FAILED"

/** `init` replaces the list; `update` replaces in place or prepends a new job. */
export const applySocketEvent = (
  jobs: ReadonlyArray<Job>,
  event: JobsSocketEvent,
): ReadonlyArray<Job> => {
  if (event.type === "init") return event.jobs
  const index = jobs.findIndex((job) => job.id === event.job.id)
  return index === -1
    ? [event.job, ...jobs]
    : jobs.map((job, position) => (position === index ? event.job : job))
}

export const STAGE_LABELS: Readonly<Record<Job["stage"], string>> = {
  UPLOADING: "Uploading to AllDebrid",
  DEBRID_PROCESSING: "Debrid processing",
  DOWNLOADING: "Downloading",
  CONVERTING: "Converting to EPUB",
  UPLOADING_COPYPARTY: "Uploading to Copyparty",
  DONE: "Complete",
  FAILED: "Failed",
}

export const shortId = (id: number): string => `#${String(id).padStart(4, "0")}`

export const formatElapsed = (nowMillis: number, startedAt: number): string => {
  const seconds = Math.max(0, Math.floor((nowMillis - startedAt) / 1000))
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

/** Decode one socket frame; anything malformed is dropped, never thrown. */
export const decodeSocketFrame = (data: unknown): Option.Option<JobsSocketEvent> =>
  typeof data === "string"
    ? pipe(Schema.decodeUnknownOption(Schema.fromJsonString(JobsSocketEventSchema))(data))
    : Option.none()

// COMMAND

export const FetchJobs = Command.define("FetchJobs", {
  args: { epoch: Schema.Int },
  messages: [Message.CompletedFetchJobs],
  execute: ({ epoch }) =>
    callApi((client) => client.jobs.list()).pipe(
      Effect.match({
        onSuccess: ({ jobs }) =>
          Message.CompletedFetchJobs({ epoch, maybeJobs: Option.some(jobs) }),
        onFailure: () => Message.CompletedFetchJobs({ epoch, maybeJobs: Option.none() }),
      }),
    ),
})

const focusCommand = (name: string, id: string) =>
  Command.define(name, {
    messages: [Message.CompletedFocus],
    execute: Dom.focus(`#${id}`).pipe(Effect.ignore, Effect.as(Message.CompletedFocus())),
  })

export const FocusConfirmClean = focusCommand("FocusConfirmClean", CONFIRM_CLEAN_BUTTON_ID)
export const FocusClean = focusCommand("FocusClean", CLEAN_BUTTON_ID)

export const ClearJobs = Command.define("ClearJobs", {
  messages: [Message.SucceededClearJobs, Message.FailedClearJobs],
  execute: callApi((client) => client.jobs.clear()).pipe(
    Effect.match({
      onSuccess: ({ deleted }) => Message.SucceededClearJobs({ deleted }),
      onFailure: ({ message }) => Message.FailedClearJobs({ reason: message }),
    }),
  ),
})

// INIT

export const init = (): Update.Return<Model, Message, ApiClientService> => ({
  model: {
    jobs: [],
    drawer: Dialog.init({ id: "jobs-drawer" }),
    isConfirmingClear: false,
    isClearing: false,
    maybeClearStatus: Option.none(),
    socketEpoch: 0,
    nowMillis: 0,
  },
  commands: [FetchJobs({ epoch: 0 })],
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message, ApiClientService>

const foldDrawerOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => (model) => ({ model }),
  Closed: () => (model) => ({ model }),
})

const drawerFold = {
  read: (model: Model) => Option.some(model.drawer),
  write: (model: Model, drawer: Dialog.Model) => modifyFields(model, { drawer: () => drawer }),
  toParentMessage: (message: Dialog.Message) => Message.GotDrawerMessage({ message }),
  foldOutMessage: foldDrawerOutMessage,
}

const foldDrawer = Update.foldChild({ update: Dialog.update, ...drawerFold })
const foldDrawerOpen = Update.foldChildStep({ update: Dialog.open, ...drawerFold })
const foldDrawerClose = Update.foldChildStep({ update: Dialog.close, ...drawerFold })

const resetClearUi = (model: Model): Model =>
  modifyFields(model, { isConfirmingClear: () => false, maybeClearStatus: () => Option.none() })

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    GotDrawerMessage: ({ message }) => foldDrawer(model, message),

    ClickedToggleDrawer: () =>
      model.drawer.isOpen
        ? foldDrawerClose(resetClearUi(model))
        : foldDrawerOpen(resetClearUi(model)),

    ReceivedSocketEvent: ({ event }) => ({
      model: modifyFields(model, {
        jobs: (jobs) => applySocketEvent(jobs, event),
        socketEpoch: (epoch) => epoch + 1,
      }),
    }),

    TickedPoll: () => ({ model, commands: [FetchJobs({ epoch: model.socketEpoch })] }),

    // A response that began before a newer socket frame is out of date.
    CompletedFetchJobs: ({ epoch, maybeJobs }) =>
      epoch === model.socketEpoch
        ? {
            model: modifyFields(model, {
              jobs: (jobs) => Option.getOrElse(maybeJobs, () => jobs),
            }),
          }
        : { model },

    CompletedFocus: () => ({ model }),

    TickedClock: ({ nowMillis }) => ({
      model: modifyFields(model, { nowMillis: () => nowMillis }),
    }),

    ClickedClean: () => ({
      model: modifyFields(model, {
        isConfirmingClear: () => true,
        maybeClearStatus: () => Option.none(),
      }),
      commands: [FocusConfirmClean()],
    }),

    ClickedCancelClean: () => ({
      model: modifyFields(model, { isConfirmingClear: () => false }),
      commands: [FocusClean()],
    }),

    ClickedConfirmClean: () =>
      model.isClearing
        ? { model }
        : {
            model: modifyFields(model, {
              isConfirmingClear: () => false,
              isClearing: () => true,
            }),
            commands: [ClearJobs(), FocusClean()],
          },

    // Feedback lives inside the drawer on purpose: while a Dialog is open
    // everything outside it is inert, so a toast could not be read or dismissed.
    SucceededClearJobs: ({ deleted }) => ({
      model: modifyFields(model, {
        isClearing: () => false,
        maybeClearStatus: () =>
          Option.some({
            kind: "success" as const,
            text: `Cleared ${deleted} completed ${deleted === 1 ? "job" : "jobs"}`,
          }),
      }),
      commands: [FetchJobs({ epoch: model.socketEpoch })],
    }),

    FailedClearJobs: ({ reason }) => ({
      model: modifyFields(model, {
        isClearing: () => false,
        maybeClearStatus: () =>
          Option.some({ kind: "error" as const, text: `Failed to clear jobs: ${reason}` }),
      }),
    }),
  })

// SUBSCRIPTION

/**
 * One connection attempt: emits each decoded frame, ends when the socket closes
 * or errors, and closes the socket if the stream is interrupted.
 */
export type SocketLike = Pick<WebSocket, "addEventListener" | "close">

export const socketStream = (
  url: string,
  openSocket: (url: string) => SocketLike = (u) => new WebSocket(u),
): Stream.Stream<Message> =>
  Stream.callback<Message>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const socket = openSocket(url)
        socket.addEventListener("message", (event: MessageEvent) => {
          Option.match(decodeSocketFrame(event.data), {
            onNone: () => undefined,
            onSome: (decoded) => {
              Queue.offerUnsafe(queue, Message.ReceivedSocketEvent({ event: decoded }))
            },
          })
        })
        socket.addEventListener("close", () => Queue.endUnsafe(queue))
        socket.addEventListener("error", () => Queue.endUnsafe(queue))
        return socket
      }),
      (socket) => Effect.sync(() => socket.close()),
    ).pipe(Effect.flatMap(() => Effect.never)),
  )

/** Keep reconnecting, waiting `RECONNECT_DELAY` after each dropped connection. */
export const reconnectingSocketStream = (
  url: string,
  openSocket?: (url: string) => SocketLike,
): Stream.Stream<Message> =>
  Stream.concat(
    socketStream(url, openSocket),
    Stream.fromEffect(Effect.sleep(RECONNECT_DELAY)).pipe(Stream.drain),
  ).pipe(Stream.forever)

export const jobsSocketUrl = (wsBase: string): string => `${wsBase}${JOBS_SOCKET_PATH}`

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  socket: Subscription.persistentEntry(reconnectingSocketStream(jobsSocketUrl(bases.ws))),
  // Backstop for the socket: if `/api/jobs/ws` can't establish (e.g. a proxy
  // that doesn't forward Upgrade) this keeps the drawer live.
  poll: Subscription.persistentEntry(
    Stream.tick(POLL_INTERVAL).pipe(
      Stream.drop(1),
      Stream.map(() => Message.TickedPoll()),
    ),
  ),
  clock: entry(
    { isDrawerOpen: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isDrawerOpen: model.drawer.isOpen }),
      dependenciesToStream: ({ isDrawerOpen }) =>
        Stream.when(
          Stream.tick(CLOCK_INTERVAL).pipe(
            Stream.mapEffect(() => Clock.currentTimeMillis),
            Stream.map((nowMillis) => Message.TickedClock({ nowMillis })),
          ),
          Effect.sync(() => isDrawerOpen),
        ),
    },
  ),
}))

// VIEW

const statusClass = (job: Job): string =>
  job.stage === "DONE"
    ? "text-success border-success/40"
    : job.stage === "FAILED"
      ? "text-red-500 border-red-500/40"
      : "text-accent-hover border-accent/40"

const progressBar = (job: Job, h: HtmlBuilder<Message>): Html =>
  Progress.view(
    {
      id: `job-${job.id}-progress`,
      value: job.progress,
      ariaLabel: `${job.title} progress`,
      toView: ({ progress, track, indicator }) =>
        h.div(
          [...progress, h.Class("h-1.5 w-full overflow-hidden rounded-full bg-border")],
          [
            h.div(
              [...track, h.Class("h-full w-full")],
              [
                h.div([
                  ...indicator,
                  h.Class("h-full rounded-full bg-accent transition-all duration-300"),
                ]),
              ],
            ),
          ],
        ),
    },
    h,
  )

const jobCard = (job: Job, nowMillis: number, h: HtmlBuilder<Message>): Html => {
  const finished = !isActiveJob(job)

  return h.div(
    [
      h.Class(
        `flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:grid sm:grid-cols-[4.5rem_1fr_8rem_auto] sm:items-center sm:gap-4 ${finished ? "opacity-70" : ""}`,
      ),
    ],
    [
      h.div(
        [h.Class("flex items-center justify-between gap-2 sm:contents")],
        [
          h.span([h.Class("font-mono text-xs text-secondary")], [shortId(job.id)]),
          h.span(
            [h.Class(`status-pill font-mono sm:order-4 ${statusClass(job)}`)],
            [STAGE_LABELS[job.stage]],
          ),
        ],
      ),
      h.div(
        [h.Class("min-w-0")],
        [
          h.p([h.Class("break-words font-display text-sm text-primary")], [job.title]),
          ...(job.stage === "FAILED" && job.error !== undefined && job.error !== ""
            ? [h.p([h.Class("mt-0.5 truncate text-xs text-red-500")], [job.error])]
            : []),
        ],
      ),
      h.div(
        [h.Class("w-full sm:w-32")],
        [
          finished
            ? h.span(
                [h.Class("font-mono text-xs text-secondary")],
                [formatElapsed(nowMillis, job.startedAt)],
              )
            : progressBar(job, h),
        ],
      ),
    ],
  )
}

const section = (
  title: string,
  jobs: ReadonlyArray<Job>,
  nowMillis: number,
  h: HtmlBuilder<Message>,
  action: ReadonlyArray<Html> = [],
): Html =>
  h.section(
    [h.Class("mb-6 last:mb-0")],
    [
      h.div(
        [h.Class("mb-3 flex items-center justify-between")],
        [
          h.h3(
            [h.Class("chapter-marker flex-1")],
            [h.span([h.Class("chapter-marker-label")], [`${title} · ${jobs.length}`])],
          ),
          ...action,
        ],
      ),
      h.div(
        [h.Class("island-shell rounded-2xl px-4")],
        jobs.map((job) => jobCard(job, nowMillis, h)),
      ),
    ],
  )

// The Clean button never changes identity, and the confirmation sits beside
// it, so keyboard focus is never on an element that gets removed.
const cleanControls = (
  model: Model,
  completedCount: number,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.div(
    [h.Class("ml-3 flex items-center gap-2 text-sm")],
    [
      ...(model.isConfirmingClear
        ? [
            h.span([h.Class("text-secondary")], [`Remove all ${completedCount} completed?`]),
            h.button(
              [
                h.Id(CONFIRM_CLEAN_BUTTON_ID),
                h.Type("button"),
                h.OnClick(Message.ClickedConfirmClean()),
                h.Class("rounded-[3px] border border-red-500 px-3 py-1 text-red-500"),
              ],
              ["Remove"],
            ),
            h.button(
              [
                h.Type("button"),
                h.OnClick(Message.ClickedCancelClean()),
                h.Class("rounded-[3px] border border-border px-3 py-1"),
              ],
              ["Keep"],
            ),
          ]
        : []),
      h.button(
        [
          h.Id(CLEAN_BUTTON_ID),
          h.Type("button"),
          h.Disabled(model.isClearing || model.isConfirmingClear),
          h.OnClick(Message.ClickedClean()),
          h.Class("rounded-[3px] border border-secondary px-3 py-1 disabled:opacity-50"),
        ],
        [model.isClearing ? "Cleaning…" : "Clean"],
      ),
    ],
  ),
]

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  if (model.jobs.length === 0 && !model.drawer.isOpen) return h.div([])

  const active = model.jobs.filter(isActiveJob)
  const completed = model.jobs.filter((job) => !isActiveJob(job))

  const sheet = ({
    dialog,
    backdrop,
    panel,
    title,
    closeButton,
    isVisible,
  }: Dialog.RenderInfo): Html =>
    h.dialog(
      [...dialog],
      isVisible
        ? [
            h.div([...backdrop, h.Class("fixed inset-0 z-50 bg-black/50")]),
            h.div(
              [
                ...panel,
                h.Class(
                  "fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] w-full flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-surface px-4 pb-6 pt-4",
                ),
              ],
              [
                h.div(
                  [h.Class("mb-4 flex items-center justify-between")],
                  [
                    h.h2([...title, h.Class("font-display text-lg italic text-primary")], ["Jobs"]),
                    h.button(
                      [...closeButton, h.AriaLabel("Close"), h.Class("text-lg text-secondary")],
                      ["×"],
                    ),
                  ],
                ),
                ...Option.match(model.maybeClearStatus, {
                  onNone: () => [],
                  onSome: ({ kind, text }) => [
                    h.p(
                      [
                        h.Role(kind === "error" ? "alert" : "status"),
                        h.Class(
                          `mb-4 text-sm ${kind === "error" ? "text-red-500" : "text-success"}`,
                        ),
                      ],
                      [text],
                    ),
                  ],
                }),
                ...(model.jobs.length === 0
                  ? [h.p([h.Class("py-6 text-center text-sm text-secondary")], ["No jobs"])]
                  : []),
                ...(active.length > 0 ? [section("Active", active, model.nowMillis, h)] : []),
                ...(completed.length > 0
                  ? [
                      section(
                        "Completed",
                        completed,
                        model.nowMillis,
                        h,
                        cleanControls(model, completed.length, h),
                      ),
                    ]
                  : []),
              ],
            ),
          ]
        : [],
    )

  return h.div(
    [],
    [
      h.button(
        [
          h.Type("button"),
          h.AriaLabel(active.length > 0 ? `Toggle jobs, ${active.length} active` : "Toggle jobs"),
          h.AriaExpanded(model.drawer.isOpen),
          h.OnClick(Message.ClickedToggleDrawer()),
          h.Class(
            "fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface shadow-lg",
          ),
        ],
        [
          h.span(
            [h.Class("font-mono text-[10px] uppercase tracking-widest text-secondary")],
            ["Jobs"],
          ),
          ...(active.length > 0
            ? [
                h.span(
                  [
                    h.Class(
                      "absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] rotate-3 items-center justify-center rounded-[2px] bg-accent px-1 font-mono text-[10px] font-bold leading-none text-on-accent shadow-sm",
                    ),
                    h.DataAttribute("active-jobs", ""),
                  ],
                  [active.length > 99 ? "99+" : String(active.length)],
                ),
              ]
            : []),
        ],
      ),
      h.submodel({
        slotId: model.drawer.id,
        model: model.drawer,
        view: Dialog.view,
        viewInputs: { toView: sheet },
        toParentMessage: (message) => Message.GotDrawerMessage({ message }),
      }),
    ],
  )
})
