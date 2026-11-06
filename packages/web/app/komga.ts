import { Dialog } from "@foldkit/ui"
import {
  type KomgaSeries,
  KomgaBookSchema,
  KomgaConfigSchema,
  KomgaLibrarySchema,
  KomgaSeriesSchema,
} from "@inkpipe/shared"
import { Array as Arr, Effect, Option, Queue, Schema, Stream, String as Str } from "effect"
import { AsyncData, Command, Mount, Submodel, Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, callApi } from "./api"
import { buttonClass, inputClass } from "./form"
import { pageHeader } from "./pageHeader"
import { lookup } from "./results"

// MODEL

export const Thumbnail = defineTaggedUnion({
  Loading: {},
  Loaded: { url: Schema.String },
  Failed: {},
})
export type Thumbnail = typeof Thumbnail.Type

const ConfigData = AsyncData.Schema(KomgaConfigSchema, Schema.String)
const LibrariesData = AsyncData.Schema(Schema.Array(KomgaLibrarySchema), Schema.String)
const SeriesData = AsyncData.Schema(Schema.Array(KomgaSeriesSchema), Schema.String)
const BooksData = AsyncData.Schema(Schema.Array(KomgaBookSchema), Schema.String)

export const Model = Schema.Struct({
  config: ConfigData.schema,
  libraries: LibrariesData.schema,
  /** `None` until the saved default is known; `""` means all libraries. */
  selectedLibraryId: Schema.Option(Schema.String),
  series: SeriesData.schema,
  filter: Schema.String,
  thumbnails: Schema.Record(Schema.String, Thumbnail),
  booksDialog: Dialog.Model,
  openSeries: Schema.Option(KomgaSeriesSchema),
  books: BooksData.schema,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  SucceededFetchConfig: { komga: KomgaConfigSchema },
  FailedFetchConfig: { reason: Schema.String },
  SucceededFetchLibraries: { libraries: Schema.Array(KomgaLibrarySchema) },
  FailedFetchLibraries: { reason: Schema.String },
  ChangedLibrary: { libraryId: Schema.String },
  ClickedRefresh: {},
  SucceededFetchSeries: { libraryId: Schema.String, series: Schema.Array(KomgaSeriesSchema) },
  FailedFetchSeries: { libraryId: Schema.String, reason: Schema.String },
  ChangedFilter: { value: Schema.String },
  BecameVisible: { seriesId: Schema.String },
  SucceededFetchThumbnail: { seriesId: Schema.String, url: Schema.String },
  FailedFetchThumbnail: { seriesId: Schema.String },
  ClickedSeries: { seriesId: Schema.String },
  GotBooksDialogMessage: { message: Dialog.Message },
  SucceededFetchBooks: { seriesId: Schema.String, books: Schema.Array(KomgaBookSchema) },
  FailedFetchBooks: { seriesId: Schema.String, reason: Schema.String },
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  /** Komga has no URL / API key saved: nothing here can work until Settings has them. */
  RequestedSettings: {},
})
export type OutMessage = typeof OutMessage.Type

// COMMAND

export const FetchConfig = Command.define("FetchKomgaConfig", {
  messages: [Message.SucceededFetchConfig, Message.FailedFetchConfig],
  execute: callApi((client) => client.settings.get()).pipe(
    Effect.match({
      onSuccess: ({ komga }) => Message.SucceededFetchConfig({ komga }),
      onFailure: ({ message }) => Message.FailedFetchConfig({ reason: message }),
    }),
  ),
})

export const FetchLibraries = Command.define("FetchKomgaLibraries", {
  messages: [Message.SucceededFetchLibraries, Message.FailedFetchLibraries],
  execute: callApi((client) => client.komga.libraries()).pipe(
    Effect.match({
      onSuccess: (libraries) => Message.SucceededFetchLibraries({ libraries }),
      onFailure: ({ message }) => Message.FailedFetchLibraries({ reason: message }),
    }),
  ),
})

export const FetchSeries = Command.define("FetchKomgaSeries", {
  args: { libraryId: Schema.String },
  messages: [Message.SucceededFetchSeries, Message.FailedFetchSeries],
  execute: ({ libraryId }) =>
    callApi((client) =>
      client.komga.series({ payload: libraryId === "" ? {} : { libraryId } }),
    ).pipe(
      Effect.match({
        onSuccess: (series) => Message.SucceededFetchSeries({ libraryId, series }),
        onFailure: ({ message }) => Message.FailedFetchSeries({ libraryId, reason: message }),
      }),
    ),
})

export const FetchThumbnail = Command.define("FetchKomgaThumbnail", {
  args: { seriesId: Schema.String },
  messages: [Message.SucceededFetchThumbnail, Message.FailedFetchThumbnail],
  execute: ({ seriesId }) =>
    callApi((client) => client.komga.thumbnail({ query: { seriesId } })).pipe(
      Effect.match({
        onSuccess: ({ thumbnail }) => Message.SucceededFetchThumbnail({ seriesId, url: thumbnail }),
        onFailure: () => Message.FailedFetchThumbnail({ seriesId }),
      }),
    ),
})

export const FetchBooks = Command.define("FetchKomgaBooks", {
  args: { seriesId: Schema.String },
  messages: [Message.SucceededFetchBooks, Message.FailedFetchBooks],
  execute: ({ seriesId }) =>
    callApi((client) => client.komga.books({ payload: { seriesId } })).pipe(
      Effect.match({
        onSuccess: (books) => Message.SucceededFetchBooks({ seriesId, books }),
        onFailure: ({ message }) => Message.FailedFetchBooks({ seriesId, reason: message }),
      }),
    ),
})

// MOUNT

export const VISIBILITY_MARGIN = "200px"

export interface ObserverLike {
  observe(element: Element): void
  disconnect(): void
}

export type ObserverFactory = (
  onChange: (entries: ReadonlyArray<{ readonly isIntersecting: boolean }>) => void,
  options: { readonly rootMargin: string },
) => ObserverLike

const browserObserver: Option.Option<ObserverFactory> =
  typeof IntersectionObserver === "undefined"
    ? Option.none()
    : Option.some(
        (onChange, options) => new IntersectionObserver((entries) => onChange(entries), options),
      )

/**
 * Emits one `BecameVisible` the first time `element` comes within the margin of
 * the viewport, then stops watching. Without observers (old browsers, tests) it
 * reports right away. The observer is disconnected however the stream ends.
 */
export const visibilityStream = (
  element: Element,
  seriesId: string,
  makeObserver: Option.Option<ObserverFactory> = browserObserver,
): Stream.Stream<typeof Message.BecameVisible.Type> =>
  Option.match(makeObserver, {
    onNone: () => Stream.make(Message.BecameVisible({ seriesId })),
    onSome: (create) =>
      Stream.callback<typeof Message.BecameVisible.Type>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const observer = create(
              (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                  Queue.offerUnsafe(queue, Message.BecameVisible({ seriesId }))
                  observer.disconnect()
                }
              },
              { rootMargin: VISIBILITY_MARGIN },
            )
            observer.observe(element)
            return observer
          }),
          (observer) => Effect.sync(() => observer.disconnect()),
        ).pipe(Effect.flatMap(() => Effect.never)),
      ),
  })

/** Reports once when a card scrolls near the viewport. */
export const ObserveVisible = Mount.defineStream("ObserveKomgaCard", {
  args: { seriesId: Schema.String },
  messages: [Message.BecameVisible],
  execute: ({ element, seriesId }) => visibilityStream(element, seriesId),
})

// PURE HELPERS

export const displayTitle = (series: KomgaSeries): string =>
  series.metadata.title === "" ? series.name : series.metadata.title

export const hasCredentials = (komga: { readonly url: string; readonly apiKey: string }): boolean =>
  komga.url !== "" && komga.apiKey !== ""

/** Series whose title contains the filter text, ignoring case. An empty filter keeps everything. */
export const filterSeries = (
  series: ReadonlyArray<KomgaSeries>,
  filter: string,
): ReadonlyArray<KomgaSeries> => {
  const wanted = Str.toLowerCase(Str.trim(filter))

  return wanted === ""
    ? series
    : series.filter((item) => Str.toLowerCase(displayTitle(item)).includes(wanted))
}

export const activeLibraryId = (model: Model): string =>
  Option.getOrElse(model.selectedLibraryId, () => "")

export const booksLabel = (count: number): string => `${count} ${count === 1 ? "book" : "books"}`

export const formatDate = (date: string): string => {
  const parsed = Date.parse(date)

  return Number.isNaN(parsed)
    ? date
    : new Date(parsed).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
}

const STATUS_CLASSES: Readonly<Record<string, string>> = {
  ONGOING: "text-emerald-600 bg-emerald-50 border-emerald-200",
  ENDED: "text-secondary bg-surface-hover border-border",
  HIATUS: "text-amber-600 bg-amber-50 border-amber-200",
  ABANDONED: "text-red-500 bg-red-50 border-red-200",
}

export const statusClass = (status: string): string =>
  Option.getOrElse(lookup(STATUS_CLASSES, status), () => STATUS_CLASSES["ENDED"] ?? "")

// INIT

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, ApiClientService>

export const init = (): Model => ({
  config: ConfigData.Idle(),
  libraries: LibrariesData.Idle(),
  selectedLibraryId: Option.none(),
  series: SeriesData.Idle(),
  filter: "",
  thumbnails: {},
  booksDialog: Dialog.init({ id: "komga-books-dialog" }),
  openSeries: Option.none(),
  books: BooksData.Idle(),
})

// UPDATE

const foldDialogOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => (model) => ({ model }),
  Closed: () => (model) => ({ model }),
})

const dialogFold = {
  read: (model: Model) => Option.some(model.booksDialog),
  write: (model: Model, booksDialog: Dialog.Model) =>
    modifyFields(model, { booksDialog: () => booksDialog }),
  toParentMessage: (message: Dialog.Message) => Message.GotBooksDialogMessage({ message }),
  foldOutMessage: foldDialogOutMessage,
}

const foldDialog = Update.foldChild({ update: Dialog.update, ...dialogFold })
const foldDialogOpen = Update.foldChildStep({ update: Dialog.open, ...dialogFold })

/** Entering the page re-checks the saved Komga settings, then loads libraries and series. */
export const enter = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    config: (config) => Option.getOrElse(AsyncData.revalidateOrLoad(config), () => config),
  }),
  commands: [FetchConfig()],
})

const startSeriesLoad = (model: Model): Model =>
  modifyFields(model, {
    series: (series) => Option.getOrElse(AsyncData.revalidateOrLoad(series), () => series),
  })

const isCurrentLibrary = (model: Model, libraryId: string): boolean =>
  Option.exists(model.selectedLibraryId, (selected) => selected === libraryId)

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    SucceededFetchConfig: ({ komga }) => {
      if (!hasCredentials(komga)) {
        return {
          model: modifyFields(model, { config: () => ConfigData.Success({ data: komga }) }),
          outMessage: OutMessage.RequestedSettings(),
        }
      }

      // The first visit adopts the saved default library; later visits keep the user's choice.
      const libraryId = Option.getOrElse(model.selectedLibraryId, () => komga.defaultLibraryId)
      const next = modifyFields(model, {
        config: () => ConfigData.Success({ data: komga }),
        selectedLibraryId: () => Option.some(libraryId),
        libraries: (libraries) =>
          Option.getOrElse(AsyncData.revalidateOrLoad(libraries), () => libraries),
      })

      return {
        model: startSeriesLoad(next),
        commands: [FetchLibraries(), FetchSeries({ libraryId })],
      }
    },

    FailedFetchConfig: ({ reason }) => ({
      model: modifyFields(model, { config: () => ConfigData.Failure({ error: reason }) }),
    }),

    SucceededFetchLibraries: ({ libraries }) => ({
      model: modifyFields(model, { libraries: () => LibrariesData.Success({ data: libraries }) }),
    }),

    FailedFetchLibraries: ({ reason }) => ({
      model: modifyFields(model, {
        libraries: (libraries) =>
          Option.match(AsyncData.getData(libraries), {
            onNone: () => LibrariesData.Failure({ error: reason }),
            onSome: (data) => LibrariesData.Stale({ error: reason, data }),
          }),
      }),
    }),

    ChangedLibrary: ({ libraryId }) =>
      isCurrentLibrary(model, libraryId)
        ? { model }
        : {
            model: startSeriesLoad(
              modifyFields(model, {
                selectedLibraryId: () => Option.some(libraryId),
                // Another library's series must not linger under the new tab.
                series: () => SeriesData.Idle(),
              }),
            ),
            commands: [FetchSeries({ libraryId })],
          },

    ClickedRefresh: () =>
      AsyncData.isFailure(model.config)
        ? enter(model)
        : Option.isNone(model.selectedLibraryId) || AsyncData.isPending(model.series)
          ? { model }
          : {
              model: startSeriesLoad(model),
              commands: [FetchSeries({ libraryId: activeLibraryId(model) })],
            },

    SucceededFetchSeries: ({ libraryId, series }) =>
      isCurrentLibrary(model, libraryId)
        ? { model: modifyFields(model, { series: () => SeriesData.Success({ data: series }) }) }
        : { model },

    FailedFetchSeries: ({ libraryId, reason }) =>
      isCurrentLibrary(model, libraryId)
        ? {
            model: modifyFields(model, {
              series: (series) =>
                Option.match(AsyncData.getData(series), {
                  onNone: () => SeriesData.Failure({ error: reason }),
                  onSome: (data) => SeriesData.Stale({ error: reason, data }),
                }),
            }),
          }
        : { model },

    ChangedFilter: ({ value }) => ({ model: modifyFields(model, { filter: () => value }) }),

    BecameVisible: ({ seriesId }) =>
      Option.isSome(lookup(model.thumbnails, seriesId))
        ? { model }
        : {
            model: modifyFields(model, {
              thumbnails: (thumbnails) => ({ ...thumbnails, [seriesId]: Thumbnail.Loading() }),
            }),
            commands: [FetchThumbnail({ seriesId })],
          },

    SucceededFetchThumbnail: ({ seriesId, url }) => ({
      model: modifyFields(model, {
        thumbnails: (thumbnails) => ({ ...thumbnails, [seriesId]: Thumbnail.Loaded({ url }) }),
      }),
    }),

    FailedFetchThumbnail: ({ seriesId }) => ({
      model: modifyFields(model, {
        thumbnails: (thumbnails) => ({ ...thumbnails, [seriesId]: Thumbnail.Failed() }),
      }),
    }),

    ClickedSeries: ({ seriesId }) => {
      const maybeSeries = Option.flatMap(AsyncData.getData(model.series), (all) =>
        Arr.findFirst(all, (item) => item.id === seriesId),
      )

      return Option.match(maybeSeries, {
        onNone: () => ({ model }),
        onSome: (series) =>
          Update.combine(
            modifyFields(model, {
              openSeries: () => Option.some(series),
              books: () => BooksData.Loading(),
            }),
            [
              foldDialogOpen,
              (stepModel) => ({ model: stepModel, commands: [FetchBooks({ seriesId })] }),
            ],
          ),
      })
    },

    GotBooksDialogMessage: ({ message }) => foldDialog(model, message),

    SucceededFetchBooks: ({ seriesId, books }) =>
      Option.exists(model.openSeries, (series) => series.id === seriesId)
        ? { model: modifyFields(model, { books: () => BooksData.Success({ data: books }) }) }
        : { model },

    FailedFetchBooks: ({ seriesId, reason }) =>
      Option.exists(model.openSeries, (series) => series.id === seriesId)
        ? { model: modifyFields(model, { books: () => BooksData.Failure({ error: reason }) }) }
        : { model },
  })

// VIEW

const bannerClass = "island-shell rounded-2xl border-red-200 p-4 text-sm text-red-600"

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  const all = Option.getOrElse(AsyncData.getData(model.series), () => [])
  const visible = filterSeries(all, model.filter)
  const isFetching = AsyncData.isPending(model.series)
  const libraries = Option.getOrElse(AsyncData.getData(model.libraries), () => [])

  const chip = (libraryId: string, label: string): Html =>
    h.button(
      [
        h.Type("button"),
        h.AriaPressed(activeLibraryId(model) === libraryId ? "true" : "false"),
        h.OnClick(Message.ChangedLibrary({ libraryId })),
        h.Class(activeLibraryId(model) === libraryId ? "chip chip-active" : "chip"),
      ],
      [label],
    )

  const card = (series: KomgaSeries): Html => {
    const thumbnail = lookup(model.thumbnails, series.id)

    return h.keyed("button")(
      series.id,
      [
        h.Type("button"),
        h.DataAttribute("series", series.id),
        h.OnMount(ObserveVisible({ seriesId: series.id })),
        h.OnClick(Message.ClickedSeries({ seriesId: series.id })),
        h.Class("group flex flex-col gap-0 rounded-sm text-left transition hover:-translate-y-0.5"),
      ],
      [
        h.span(
          [h.Class("cover-shell relative block aspect-[2/3] w-full min-w-64 bg-surface")],
          Option.match(thumbnail, {
            onNone: () => [h.span([h.Class("absolute inset-0 block animate-pulse bg-surface")])],
            onSome: (state) =>
              Thumbnail.match<ReadonlyArray<Html>>(state, {
                Loading: () => [
                  h.span([h.Class("absolute inset-0 block animate-pulse bg-surface")]),
                ],
                Loaded: ({ url }) => [
                  h.img([
                    h.Src(url),
                    h.Alt(displayTitle(series)),
                    h.Class("h-full w-full object-cover"),
                  ]),
                ],
                Failed: () => [],
              }),
          }),
        ),
        h.span(
          [h.Class("flex flex-col gap-2 p-3")],
          [
            h.span(
              [h.Class("flex items-start justify-between gap-2")],
              [
                h.span(
                  [
                    h.Class(
                      "block line-clamp-2 text-sm font-semibold leading-snug text-primary group-hover:text-accent",
                    ),
                  ],
                  [displayTitle(series)],
                ),
                ...(series.metadata.status === ""
                  ? []
                  : [
                      h.span(
                        [
                          h.Class(
                            `shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusClass(series.metadata.status)}`,
                          ),
                        ],
                        [series.metadata.status],
                      ),
                    ]),
              ],
            ),
            h.span([h.Class("block text-xs text-secondary")], [booksLabel(series.booksCount)]),
          ],
        ),
      ],
    )
  }

  const body: ReadonlyArray<Html> = AsyncData.matchData(model.series, {
    onEmpty: () =>
      Option.isNone(model.selectedLibraryId) && AsyncData.isFailure(model.config)
        ? []
        : [
            h.div(
              [
                h.Role("status"),
                h.Class("flex items-center justify-center py-24 text-sm text-secondary"),
              ],
              ["Loading library..."],
            ),
          ],
    onFailure: (reason) => [h.div([h.Role("alert"), h.Class(bannerClass)], [reason])],
    onData: () =>
      Arr.isReadonlyArrayEmpty(visible)
        ? [
            h.div(
              [h.Class("blank-page flex flex-col items-center gap-3 p-8 text-center")],
              [
                h.div([h.Class("blank-page-icon")]),
                h.p(
                  [h.Class("font-display text-lg italic text-primary")],
                  [Str.trim(model.filter) === "" ? "Nothing on the shelf" : "No matches"],
                ),
                h.p(
                  [h.Class("text-sm text-secondary")],
                  [
                    Str.trim(model.filter) === ""
                      ? "No series found in Komga."
                      : "No series match your search.",
                  ],
                ),
              ],
            ),
          ]
        : [
            h.div(
              [h.Class("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4")],
              visible.map(card),
            ),
          ],
  })

  const configNote = AsyncData.match(model.config, {
    onIdle: () => [],
    onLoading: () => [],
    onRefreshing: () => [],
    onFailure: (reason) => [
      h.div(
        [h.Role("alert"), h.Class(bannerClass)],
        [`Couldn't load your Komga settings: ${reason}`],
      ),
    ],
    onStale: ({ error }) => [
      h.div(
        [h.Role("alert"), h.Class(bannerClass)],
        [`Couldn't refresh your Komga settings: ${error}`],
      ),
    ],
    onSuccess: () => [],
  })

  const staleNote = AsyncData.isStale(model.series)
    ? [
        h.div(
          [h.Role("alert"), h.Class(bannerClass)],
          [Option.getOrElse(AsyncData.getError(model.series), () => "")],
        ),
      ]
    : []

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
                      "island-shell flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-surface",
                    ),
                  ],
                  [
                    h.div(
                      [h.Class("flex items-start justify-between border-b border-border p-5")],
                      [
                        h.div(
                          [],
                          [
                            h.h2(
                              [...title, h.Class("font-display text-lg italic text-primary")],
                              [
                                Option.match(model.openSeries, {
                                  onNone: () => "",
                                  onSome: displayTitle,
                                }),
                              ],
                            ),
                            ...Option.match(model.openSeries, {
                              onNone: () => [],
                              onSome: (series) => [
                                h.p(
                                  [...description, h.Class("mt-0.5 text-xs text-secondary")],
                                  [`${booksLabel(series.booksCount)} · ${series.metadata.status}`],
                                ),
                              ],
                            }),
                          ],
                        ),
                        h.button(
                          [...closeButton, h.AriaLabel("Close"), h.Class("text-lg text-secondary")],
                          ["×"],
                        ),
                      ],
                    ),
                    h.div([h.Class("overflow-y-auto p-5")], [booksBody(model, h)]),
                  ],
                ),
              ],
            ),
          ]
        : [],
    )

  return h.main(
    [h.Class("page-wrap flex flex-col gap-6 pb-8 pt-8 sm:px-4")],
    [
      pageHeader(h, {
        numeral: "III",
        label: "Komga",
        title: "Library",
        ...(AsyncData.hasData(model.series) ? { meta: `${all.length} series` } : {}),
      }),
      h.section(
        [h.Class("flex items-center justify-end")],
        [
          h.button(
            [
              h.Type("button"),
              h.Disabled(
                isFetching ||
                  (Option.isNone(model.selectedLibraryId) && !AsyncData.isFailure(model.config)),
              ),
              h.OnClick(Message.ClickedRefresh()),
              h.Class(buttonClass.refresh),
            ],
            [isFetching ? "Loading..." : "Refresh"],
          ),
        ],
      ),
      ...(Arr.isReadonlyArrayEmpty(libraries)
        ? []
        : [
            h.div(
              [h.Class("flex flex-wrap gap-2")],
              [chip("", "All"), ...libraries.map((library) => chip(library.id, library.name))],
            ),
          ]),
      h.input([
        h.Type("text"),
        h.AriaLabel("Filter series"),
        h.Placeholder("Filter series..."),
        h.Value(model.filter),
        h.OnInput((value) => Message.ChangedFilter({ value })),
        h.Class(inputClass),
      ]),
      ...configNote,
      ...staleNote,
      ...body,
      h.submodel({
        slotId: model.booksDialog.id,
        model: model.booksDialog,
        view: Dialog.view,
        viewInputs: { toView: dialogView },
        toParentMessage: (message) => Message.GotBooksDialogMessage({ message }),
      }),
    ],
  )
})

const booksBody = (model: Model, h: HtmlBuilder<Message>): Html =>
  AsyncData.matchData(model.books, {
    onEmpty: () =>
      h.div(
        [
          h.Role("status"),
          h.Class("flex items-center justify-center py-12 text-sm text-secondary"),
        ],
        ["Loading books..."],
      ),
    onFailure: (reason) =>
      h.div(
        [h.Role("alert"), h.Class("rounded-xl border border-red-200 p-4 text-sm text-red-600")],
        [reason],
      ),
    onData: (books) =>
      Arr.isReadonlyArrayEmpty(books)
        ? h.div([h.Class("py-12 text-center text-sm text-secondary")], ["No books found."])
        : h.div(
            [h.Class("space-y-2")],
            books.map((book) =>
              h.keyed("div")(
                book.id,
                [
                  h.Class(
                    "flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3",
                  ),
                ],
                [
                  h.div(
                    [h.Class("min-w-0 flex-1")],
                    [
                      h.p(
                        [h.Class("truncate text-sm font-medium text-primary")],
                        [book.metadata.title === "" ? book.name : book.metadata.title],
                      ),
                      h.div(
                        [h.Class("mt-0.5 flex items-center gap-3 text-xs text-secondary")],
                        [
                          ...(book.metadata.number === ""
                            ? []
                            : [
                                h.span(
                                  [h.DataAttribute("field", "number")],
                                  [`#${book.metadata.number}`],
                                ),
                              ]),
                          ...(book.media.pagesCount > 0
                            ? [
                                h.span(
                                  [h.DataAttribute("field", "pages")],
                                  [`${book.media.pagesCount} pages`],
                                ),
                              ]
                            : []),
                          ...(book.size === ""
                            ? []
                            : [h.span([h.DataAttribute("field", "size")], [book.size])]),
                          ...(book.created === ""
                            ? []
                            : [
                                h.span(
                                  [h.DataAttribute("field", "created")],
                                  [formatDate(book.created)],
                                ),
                              ]),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
  })
