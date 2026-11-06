import { Textarea } from "@foldkit/ui"
import { Array as Arr, Duration, Effect, Option, Schema } from "effect"
import { AsyncData, Command, Submodel, type Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, bases, describeError } from "./api"
import { buttonClass, inputClass, labelClass, textField } from "./form"
import { pageHeader } from "./pageHeader"
import * as Push from "./push"
import type { PushStatus } from "./pushFlow"

// A developer-only API explorer: pick an endpoint, send it, read the answer.
// It deliberately bypasses the typed client, because its point is to poke at
// the raw HTTP surface.

const EYEBROW = "— — DEBUG (APPENDIX)"
const TEST_RESULT_DURATION = Duration.seconds(3)

// ENDPOINTS

export interface EndpointDef {
  readonly group: string
  readonly label: string
  readonly method: "GET" | "POST" | "DELETE"
  readonly path: string
  /** Query parameter name, if the endpoint takes one. */
  readonly queryKey?: string
  /** Field the JSON body starts with, if the endpoint takes a body. */
  readonly bodyKey?: string
  /** The answer is binary: show its metadata, not its bytes. */
  readonly binary?: boolean
  readonly mutating?: boolean
}

export const ENDPOINTS: ReadonlyArray<EndpointDef> = [
  { group: "Search", label: "Search", method: "GET", path: "/api/search", queryKey: "q" },
  { group: "Search", label: "Latest", method: "GET", path: "/api/latest" },

  { group: "Komga", label: "Libraries", method: "GET", path: "/api/komga/libraries" },
  {
    group: "Komga",
    label: "Series",
    method: "POST",
    path: "/api/komga/series",
    bodyKey: "libraryId",
  },
  {
    group: "Komga",
    label: "Thumbnail",
    method: "GET",
    path: "/api/komga/thumbnail",
    queryKey: "seriesId",
    binary: true,
  },
  {
    group: "Komga",
    label: "Books",
    method: "POST",
    path: "/api/komga/books",
    bodyKey: "seriesId",
  },

  { group: "Copyparty", label: "List Folders", method: "GET", path: "/api/copyparty/folders" },
  {
    group: "Copyparty",
    label: "Create Folder",
    method: "POST",
    path: "/api/copyparty/folders",
    bodyKey: "name",
    mutating: true,
  },
  {
    group: "Copyparty",
    label: "Delete Folder",
    method: "DELETE",
    path: "/api/copyparty/folders",
    bodyKey: "name",
    mutating: true,
  },

  {
    group: "Convert",
    label: "Download",
    method: "GET",
    path: "/api/convert",
    queryKey: "id",
    binary: true,
  },

  { group: "Settings", label: "Get Config", method: "GET", path: "/api/settings" },

  { group: "Jobs", label: "List Jobs", method: "GET", path: "/api/jobs" },

  { group: "Push", label: "VAPID Public Key", method: "GET", path: "/api/push/vapid-public-key" },
  {
    group: "Push",
    label: "Subscribe",
    method: "POST",
    path: "/api/push/subscribe",
    bodyKey: "subscription",
    mutating: true,
  },
]

export const endpointAt = (index: number): Option.Option<EndpointDef> =>
  Option.fromNullishOr(ENDPOINTS[index])

/** Endpoints grouped for the sidebar, keeping their order and their index. */
export const groupedEndpoints = (): ReadonlyArray<{
  readonly group: string
  readonly entries: ReadonlyArray<{ readonly index: number; readonly endpoint: EndpointDef }>
}> =>
  Object.entries(
    Arr.groupBy(
      ENDPOINTS.map((endpoint, index) => ({ index, endpoint })),
      ({ endpoint }) => endpoint.group,
    ),
  ).map(([group, entries]) => ({ group, entries }))

// MODEL

const DebugResponse = Schema.Struct({
  status: Schema.Int,
  contentType: Schema.String,
  body: Schema.String,
})
export type DebugResponse = typeof DebugResponse.Type

const ResponseData = AsyncData.Schema(DebugResponse, Schema.String)

export const Model = Schema.Struct({
  /** Only in development: the explorer can send arbitrary requests. */
  isEnabled: Schema.Boolean,
  maybeSelectedIndex: Schema.Option(Schema.Int),
  queryValue: Schema.String,
  bodyValue: Schema.String,
  response: ResponseData.schema,
  /** Bumped per send and per selection, so only the latest answer is shown. */
  requestSeq: Schema.Int,
  push: Push.Model,
  maybeTestResult: Schema.Option(Schema.String),
  testSeq: Schema.Int,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedEndpoint: { index: Schema.Int },
  ChangedQuery: { value: Schema.String },
  ChangedBody: { value: Schema.String },
  ClickedSend: {},
  SucceededRequest: { seq: Schema.Int, response: DebugResponse },
  FailedRequest: { seq: Schema.Int, reason: Schema.String },
  GotPushMessage: { message: Push.Message },
  ClickedTestNotification: {},
  SucceededTestNotification: {},
  FailedTestNotification: {},
  ClearedTestResult: { seq: Schema.Int },
})
export type Message = typeof Message.Type

// PURE HELPERS

const parseJson = Option.liftThrowable<[string], unknown>((text) => JSON.parse(text))

export const prettyJson = (text: string): string =>
  Option.match(parseJson(text), {
    onNone: () => text,
    onSome: (value) => JSON.stringify(value, null, 2),
  })

export const requestUrl = (base: string, endpoint: EndpointDef, queryValue: string): string => {
  const params = new URLSearchParams()
  const trimmed = queryValue.trim()

  if (endpoint.queryKey !== undefined && trimmed.length > 0) {
    params.set(endpoint.queryKey, trimmed)
  }

  const query = params.toString()

  return `${base}${endpoint.path}${query.length > 0 ? `?${query}` : ""}`
}

export const initialBody = (endpoint: EndpointDef): string =>
  endpoint.bodyKey === undefined ? "" : JSON.stringify({ [endpoint.bodyKey]: "" }, null, 2)

/**
 * What to send as the body: nothing for GET and body-less endpoints, `{}` when
 * the box is empty, otherwise the box's JSON, or `None` + an error if it isn't JSON.
 */
export const requestBody = (
  endpoint: EndpointDef,
  bodyValue: string,
): Option.Option<Option.Option<string>> => {
  if (endpoint.method === "GET" || endpoint.bodyKey === undefined) {
    return Option.some(Option.none())
  }

  if (bodyValue.trim().length === 0) {
    return Option.some(Option.some("{}"))
  }

  return Option.map(parseJson(bodyValue), (value) => Option.some(JSON.stringify(value)))
}

export const isSuccessStatus = (status: number): boolean => status >= 200 && status < 300

/** What the browser's notification setup amounts to (not the raw permission: see `Push`). */
export const statusLabel = (status: Option.Option<PushStatus>): string =>
  Option.match(status, {
    onNone: () => "unknown",
    onSome: (value) => value.toLowerCase(),
  })

// COMMAND

export const SendRequest = Command.define("SendDebugRequest", {
  args: {
    seq: Schema.Int,
    method: Schema.Literals(["GET", "POST", "DELETE"]),
    url: Schema.String,
    body: Schema.Option(Schema.String),
    binary: Schema.Boolean,
  },
  messages: [Message.SucceededRequest, Message.FailedRequest],
  execute: ({ seq, method, url, body, binary }) =>
    Effect.tryPromise({
      try: async () => {
        const result = await fetch(url, {
          method,
          ...Option.match(body, {
            onNone: () => ({}),
            onSome: (text) => ({ headers: { "Content-Type": "application/json" }, body: text }),
          }),
        })
        const contentType = result.headers.get("content-type") ?? "unknown"

        if (binary) {
          return {
            status: result.status,
            contentType,
            body: `[Binary response: ${contentType}, ${result.headers.get("content-length") ?? "unknown"} bytes]`,
          }
        }

        return { status: result.status, contentType, body: prettyJson(await result.text()) }
      },
      catch: describeError,
    }).pipe(
      Effect.match({
        onSuccess: (response) => Message.SucceededRequest({ seq, response }),
        onFailure: (reason) => Message.FailedRequest({ seq, reason }),
      }),
    ),
})

export const SendTestNotification = Command.define("SendTestNotification", {
  messages: [Message.SucceededTestNotification, Message.FailedTestNotification],
  execute: Effect.tryPromise(async () => {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification("Inkpipe Test", {
      body: "This is a test notification from the debug page.",
    })
  }).pipe(
    Effect.match({
      onSuccess: () => Message.SucceededTestNotification(),
      onFailure: () => Message.FailedTestNotification(),
    }),
  ),
})

export const ClearTestResult = Command.define("ClearTestResult", {
  args: { seq: Schema.Int },
  messages: [Message.ClearedTestResult],
  execute: ({ seq }) =>
    Effect.sleep(TEST_RESULT_DURATION).pipe(Effect.as(Message.ClearedTestResult({ seq }))),
})

// INIT

type UpdateReturn = Update.Return<Model, Message, ApiClientService>

export const init = (isEnabled: boolean): Model => ({
  isEnabled,
  maybeSelectedIndex: Option.none(),
  queryValue: "",
  bodyValue: "",
  response: ResponseData.Idle(),
  requestSeq: 0,
  push: Push.init(),
  maybeTestResult: Option.none(),
  testSeq: 0,
})

/** Entering the page: see what the browser says about notifications. */
export const enter = (model: Model): UpdateReturn =>
  model.isEnabled
    ? {
        model,
        commands: Push.refresh(model.push).commands?.map(
          Command.mapMessage((message) => Message.GotPushMessage({ message })),
        ),
      }
    : { model }

// UPDATE

const selectedEndpoint = (model: Model): Option.Option<EndpointDef> =>
  Option.flatMap(model.maybeSelectedIndex, endpointAt)

const reportTestResult = (model: Model, text: string): UpdateReturn => {
  const seq = model.testSeq + 1

  return {
    model: modifyFields(model, {
      maybeTestResult: () => Option.some(text),
      testSeq: () => seq,
    }),
    commands: [ClearTestResult({ seq })],
  }
}

const mapPush = (
  model: Model,
  result: Update.Return<Push.Model, Push.Message, ApiClientService>,
): UpdateReturn => ({
  model: modifyFields(model, { push: () => result.model }),
  commands: result.commands?.map(
    Command.mapMessage((message) => Message.GotPushMessage({ message })),
  ),
})

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ClickedEndpoint: ({ index }) =>
      Option.match(endpointAt(index), {
        onNone: () => ({ model }),
        onSome: (endpoint) => ({
          model: modifyFields(model, {
            maybeSelectedIndex: () => Option.some(index),
            queryValue: () => "",
            bodyValue: () => initialBody(endpoint),
            response: () => ResponseData.Idle(),
            // An answer to the previous endpoint must not appear under this one.
            requestSeq: (seq) => seq + 1,
          }),
        }),
      }),

    ChangedQuery: ({ value }) => ({ model: modifyFields(model, { queryValue: () => value }) }),
    ChangedBody: ({ value }) => ({ model: modifyFields(model, { bodyValue: () => value }) }),

    ClickedSend: () => {
      if (AsyncData.isPending(model.response)) {
        return { model }
      }

      return Option.match(selectedEndpoint(model), {
        onNone: () => ({ model }),
        onSome: (endpoint) =>
          Option.match(requestBody(endpoint, model.bodyValue), {
            onNone: () => ({
              model: modifyFields(model, {
                response: () => ResponseData.Failure({ error: "Invalid JSON body" }),
              }),
            }),
            onSome: (body) => {
              const seq = model.requestSeq + 1

              return {
                model: modifyFields(model, {
                  requestSeq: () => seq,
                  response: () => ResponseData.Loading(),
                }),
                commands: [
                  SendRequest({
                    seq,
                    method: endpoint.method,
                    url: requestUrl(bases.http, endpoint, model.queryValue),
                    body,
                    binary: endpoint.binary === true,
                  }),
                ],
              }
            },
          }),
      })
    },

    SucceededRequest: ({ seq, response }) =>
      seq === model.requestSeq
        ? {
            model: modifyFields(model, {
              response: () => ResponseData.Success({ data: response }),
            }),
          }
        : { model },

    FailedRequest: ({ seq, reason }) =>
      seq === model.requestSeq
        ? {
            model: modifyFields(model, { response: () => ResponseData.Failure({ error: reason }) }),
          }
        : { model },

    GotPushMessage: ({ message }) => mapPush(model, Push.update(model.push, message)),

    ClickedTestNotification: () => ({ model, commands: [SendTestNotification()] }),
    SucceededTestNotification: () => reportTestResult(model, "Test notification sent"),
    FailedTestNotification: () => reportTestResult(model, "Failed to send test notification"),
    ClearedTestResult: ({ seq }) =>
      seq === model.testSeq
        ? { model: modifyFields(model, { maybeTestResult: () => Option.none() }) }
        : { model },
  })

// VIEW

const methodColor = (method: EndpointDef["method"]): string =>
  method === "GET" ? "text-green-600" : method === "POST" ? "text-amber-600" : "text-red-600"

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  if (!model.isEnabled) {
    return h.main(
      [h.Class("page-wrap pb-8 pt-8 sm:px-4")],
      [
        pageHeader(h, { eyebrow: EYEBROW, title: "Debug" }),
        h.p(
          [h.Class("text-sm text-primary/60")],
          ["The debug page is only available in development mode."],
        ),
      ],
    )
  }

  const maybeEndpoint = selectedEndpoint(model)

  const sidebar = h.aside(
    [h.Class("island-shell w-56 shrink-0 overflow-auto rounded-2xl p-3")],
    groupedEndpoints().map(({ group, entries }) =>
      h.div(
        [h.Class("mb-3 last:mb-0")],
        [
          h.p(
            [h.Class("px-2 py-1 text-xs font-semibold uppercase tracking-wider text-primary/40")],
            [group],
          ),
          ...entries.map(({ index, endpoint }) =>
            h.button(
              [
                h.Type("button"),
                h.DataAttribute("endpoint", String(index)),
                h.AriaPressed(
                  String(Option.exists(model.maybeSelectedIndex, (selected) => selected === index)),
                ),
                h.OnClick(Message.ClickedEndpoint({ index })),
                h.Class(
                  `flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                    Option.exists(model.maybeSelectedIndex, (selected) => selected === index)
                      ? "bg-accent/15 text-primary"
                      : "text-primary/70 hover:bg-accent/10"
                  }`,
                ),
              ],
              [
                h.span(
                  [
                    h.Class(
                      `w-9 shrink-0 font-mono text-[10px] font-bold ${methodColor(endpoint.method)}`,
                    ),
                  ],
                  [endpoint.method],
                ),
                h.span([h.Class("truncate")], [endpoint.label]),
                ...(endpoint.mutating === true
                  ? [
                      h.span(
                        [
                          h.Class(
                            "ml-auto shrink-0 rounded-full bg-red-100 px-1.5 py-px text-[9px] font-semibold text-red-600",
                          ),
                        ],
                        ["MUT"],
                      ),
                    ]
                  : []),
              ],
            ),
          ),
        ],
      ),
    ),
  )

  const requestPanel = (endpoint: EndpointDef): Html =>
    h.div(
      [h.Class("island-shell rounded-2xl p-4")],
      [
        h.div(
          [h.Class("mb-4 flex items-center gap-3")],
          [
            h.span(
              [
                h.Class(
                  `rounded bg-surface px-2 py-0.5 font-mono text-xs font-bold ${methodColor(endpoint.method)}`,
                ),
              ],
              [endpoint.method],
            ),
            h.span([h.Class("text-sm text-primary")], [endpoint.path]),
            ...(endpoint.mutating === true
              ? [
                  h.span(
                    [
                      h.Class(
                        "rounded-full bg-red-100 px-2 py-px text-[10px] font-semibold text-red-600",
                      ),
                    ],
                    ["Mutation"],
                  ),
                ]
              : []),
          ],
        ),
        ...(endpoint.queryKey === undefined
          ? []
          : [
              h.div(
                [h.Class("mb-3")],
                [
                  textField(h, {
                    id: "debug-query",
                    label: endpoint.queryKey,
                    value: model.queryValue,
                    placeholder: `Enter ${endpoint.queryKey}...`,
                    onInput: (value) => Message.ChangedQuery({ value }),
                  }),
                ],
              ),
            ]),
        ...(endpoint.bodyKey === undefined
          ? []
          : [
              h.div(
                [h.Class("mb-3")],
                [
                  Textarea.view(
                    {
                      id: "debug-body",
                      value: model.bodyValue,
                      rows: 6,
                      onInput: (value) => Message.ChangedBody({ value }),
                      toView: ({ textarea, label }) =>
                        h.div(
                          [],
                          [
                            h.label(
                              [...label, h.Class(labelClass)],
                              [`Body (JSON) — {"${endpoint.bodyKey}": "..."}`],
                            ),
                            h.textarea([
                              ...textarea,
                              h.Class(`${inputClass} font-mono`),
                              h.Spellcheck(false),
                            ]),
                          ],
                        ),
                    },
                    h,
                  ),
                ],
              ),
            ]),
        ...(endpoint.queryKey === undefined && endpoint.bodyKey === undefined
          ? [h.p([h.Class("mb-3 text-xs text-primary/40")], ["No parameters required."])]
          : []),
        h.button(
          [
            h.Type("button"),
            h.Disabled(AsyncData.isPending(model.response)),
            h.OnClick(Message.ClickedSend()),
            h.Class(buttonClass.primary),
          ],
          [AsyncData.isPending(model.response) ? "Sending..." : "Send"],
        ),
      ],
    )

  const responsePanel = h.div(
    [h.Class("island-shell flex-1 overflow-auto rounded-2xl p-4")],
    [
      h.h2([h.Class("mb-3 text-sm font-semibold text-primary")], ["Response"]),
      ...AsyncData.matchData(model.response, {
        onEmpty: () =>
          AsyncData.isPending(model.response)
            ? [h.p([h.Role("status"), h.Class("text-sm text-primary/50")], ["Loading..."])]
            : [
                h.p(
                  [h.Class("text-xs text-primary/40")],
                  ["Send a request to see the response here."],
                ),
              ],
        onFailure: (reason) => [
          h.div(
            [
              h.Role("alert"),
              h.Class("rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600"),
            ],
            [reason],
          ),
        ],
        onData: (response) => [
          h.div(
            [h.Class("mb-3 flex flex-wrap items-center gap-3")],
            [
              h.span(
                [
                  h.DataAttribute("response-status", String(response.status)),
                  h.Class(
                    `rounded px-2 py-0.5 font-mono text-xs font-bold ${
                      isSuccessStatus(response.status)
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`,
                  ),
                ],
                [String(response.status)],
              ),
              h.span([h.Class("text-xs text-primary/50")], [response.contentType]),
            ],
          ),
          h.pre(
            [
              h.DataAttribute("response-body", ""),
              h.Class(
                "max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-primary/5 p-3 font-mono text-xs text-primary/80",
              ),
            ],
            [response.body],
          ),
        ],
      }),
    ],
  )

  const status = Option.getOrUndefined(model.push.maybeStatus)

  const pushPanel = h.div(
    [h.Class("island-shell mt-6 rounded-2xl p-4")],
    [
      h.h2([h.Class("mb-3 text-sm font-semibold text-primary")], ["Push Notifications"]),
      status === "Unsupported"
        ? h.p(
            [h.Class("text-sm text-secondary")],
            ["Push notifications are not supported in this browser."],
          )
        : h.div(
            [h.Class("space-y-3")],
            [
              h.div(
                [h.Class("flex items-center gap-3")],
                [
                  h.span([h.Class("text-xs text-secondary")], ["Status:"]),
                  h.span(
                    [
                      h.DataAttribute("push-status", statusLabel(model.push.maybeStatus)),
                      h.Class(
                        `rounded px-2 py-0.5 font-mono text-xs font-bold ${
                          status === "Subscribed"
                            ? "bg-green-100 text-green-700"
                            : status === "Denied"
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600"
                        }`,
                      ),
                    ],
                    [statusLabel(model.push.maybeStatus)],
                  ),
                ],
              ),
              h.div(
                [h.Class("flex items-center gap-2")],
                [
                  ...(status === "Default"
                    ? [
                        h.button(
                          [
                            h.Type("button"),
                            h.Disabled(model.push.isWorking),
                            h.OnClick(
                              Message.GotPushMessage({ message: Push.Message.ClickedEnable() }),
                            ),
                            h.Class(
                              "rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50",
                            ),
                          ],
                          [model.push.isWorking ? "Subscribing..." : "Subscribe"],
                        ),
                      ]
                    : []),
                  ...(status === "Subscribed"
                    ? [
                        h.button(
                          [
                            h.Type("button"),
                            h.Disabled(model.push.isWorking),
                            h.OnClick(
                              Message.GotPushMessage({ message: Push.Message.ClickedDisable() }),
                            ),
                            h.Class(
                              "rounded-full border border-red-200 px-4 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50",
                            ),
                          ],
                          ["Unsubscribe"],
                        ),
                      ]
                    : []),
                  ...(status === "Denied"
                    ? [
                        h.p(
                          [h.Class("text-xs text-secondary")],
                          ["Permission denied. Enable notifications in your browser settings."],
                        ),
                      ]
                    : []),
                ],
              ),
              ...Option.match(model.push.maybeError, {
                onNone: () => [],
                onSome: (reason) => [
                  h.p(
                    [h.Role("alert"), h.Class("text-xs text-red-600")],
                    [`Couldn't update notifications: ${reason}`],
                  ),
                ],
              }),
              ...(status === "Subscribed"
                ? [
                    h.div(
                      [],
                      [
                        h.button(
                          [
                            h.Type("button"),
                            h.OnClick(Message.ClickedTestNotification()),
                            h.Class(
                              "rounded-[3px] border border-border px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-surface-2",
                            ),
                          ],
                          ["Send Test Notification"],
                        ),
                        ...Option.match(model.maybeTestResult, {
                          onNone: () => [],
                          onSome: (text) => [
                            h.span(
                              [h.Role("status"), h.Class("ml-3 text-xs text-secondary")],
                              [text],
                            ),
                          ],
                        }),
                      ],
                    ),
                  ]
                : []),
            ],
          ),
    ],
  )

  return h.main(
    [h.Class("page-wrap pb-8 pt-8 sm:px-4")],
    [
      pageHeader(h, { eyebrow: EYEBROW, title: "Debug — API Explorer" }),
      h.div(
        [h.Class("-mt-2 mb-4")],
        [
          h.a(
            [
              h.Href(`${bases.http}/docs`),
              h.Target("_blank"),
              h.Rel("noopener noreferrer"),
              h.Class("text-xs text-accent underline hover:text-accent-hover"),
            ],
            ["Open Swagger docs ↗"],
          ),
        ],
      ),
      h.div(
        [h.Class("flex h-[calc(100vh-12rem)] gap-6")],
        [
          sidebar,
          h.div(
            [h.Class("flex flex-1 flex-col gap-4 overflow-auto")],
            Option.match(maybeEndpoint, {
              onNone: () => [
                h.div(
                  [
                    h.Class(
                      "island-shell flex flex-1 items-center justify-center rounded-2xl p-8 text-center text-sm text-primary/50",
                    ),
                  ],
                  ["Select an endpoint from the sidebar to get started."],
                ),
              ],
              onSome: (endpoint) => [requestPanel(endpoint), responsePanel],
            }),
          ),
        ],
      ),
      pushPanel,
    ],
  )
})
