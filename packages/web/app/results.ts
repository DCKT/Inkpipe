import {
  type KomgaSeries,
  KomgaSeriesSchema,
  type MatchResult,
  MatchResultSchema,
  type ProwlarrResult,
  ProwlarrResultSchema,
  findBestMatch,
} from "@inkpipe/shared"
import { Checkbox } from "@foldkit/ui"
import { Array as Arr, Effect, Option, Schema } from "effect"
import { AsyncData, Command, Submodel, type Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, callApi } from "./api"

// A selectable list of Prowlarr results with per-row "Save to AllDebrid" and a
// Komga "already in your library" badge. Shared by the search and Latest pages;
// they hand it items and read back the selection.

// MODEL

export const SaveState = defineTaggedUnion({
  Saving: {},
  Saved: {},
  Failed: { reason: Schema.String },
})
export type SaveState = typeof SaveState.Type

const SeriesData = AsyncData.Schema(Schema.Array(KomgaSeriesSchema), Schema.String)

export const Model = Schema.Struct({
  items: Schema.Array(ProwlarrResultSchema),
  /** Guids of the selected items, in the order they were picked. */
  selected: Schema.Array(Schema.String),
  saves: Schema.Record(Schema.String, SaveState),
  series: SeriesData.schema,
  /** Best Komga match per item guid, kept up to date as items or series change. */
  matches: Schema.Record(Schema.String, MatchResultSchema),
  /** Wall clock for relative dates ("3d ago"), set when items arrive. */
  nowMillis: Schema.Finite,
  /** Bumped on every `setItems`, so answers to requests about an old list can be told apart. */
  listVersion: Schema.Int,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ToggledResult: { guid: Schema.String },
  ToggledAll: {},
  ClickedSaveToAllDebrid: { guid: Schema.String },
  SucceededSaveMagnet: { guid: Schema.String, listVersion: Schema.Int },
  FailedSaveMagnet: { guid: Schema.String, listVersion: Schema.Int, reason: Schema.String },
  SucceededFetchSeries: { series: Schema.Array(KomgaSeriesSchema) },
  FailedFetchSeries: { reason: Schema.String },
})
export type Message = typeof Message.Type

// PURE HELPERS

/**
 * Guids come from indexers, so they can be any string, including names that
 * exist on every object (`constructor`, `toString`, `__proto__`). Only own
 * properties count.
 */
export const lookup = <A>(record: Readonly<Record<string, A>>, key: string): Option.Option<A> =>
  Object.hasOwn(record, key) ? Option.some(record[key] as A) : Option.none()

const SIZE_UNITS = ["B", "KB", "MB", "GB"] as const
const BYTES_PER_UNIT = 1024

export const formatSize = (bytes: number): string => {
  if (bytes <= 0) {
    return "0 B"
  }

  const unit = Math.min(
    Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)),
    SIZE_UNITS.length - 1,
  )

  return `${(bytes / BYTES_PER_UNIT ** unit).toFixed(1)} ${SIZE_UNITS[unit]}`
}

const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_PER_WEEK = 7
const DAYS_PER_MONTH = 30
const DAYS_PER_YEAR = 365
const WEEKS_SHOWN_BEFORE_MONTHS = 5
const MONTHS_PER_YEAR = 12

export type RelativeTime = Readonly<{ relative: string; full: string }>

/** "just now" … "3d ago" … "2y ago", or `None` for a missing or unparseable date. */
export const formatRelativeTime = (
  nowMillis: number,
  date: string | null,
): Option.Option<RelativeTime> => {
  if (date === null) {
    return Option.none()
  }

  const parsed = Date.parse(date)

  if (Number.isNaN(parsed)) {
    return Option.none()
  }

  const seconds = Math.floor((nowMillis - parsed) / 1000)
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  const days = Math.floor(hours / HOURS_PER_DAY)
  const weeks = Math.floor(days / DAYS_PER_WEEK)
  const months = Math.floor(days / DAYS_PER_MONTH)
  // Months run out at 12 (360 days) before a full year (365): never show "0y".
  const years = Math.max(1, Math.floor(days / DAYS_PER_YEAR))

  const relative =
    seconds < SECONDS_PER_MINUTE
      ? "just now"
      : minutes < MINUTES_PER_HOUR
        ? `${minutes}m ago`
        : hours < HOURS_PER_DAY
          ? `${hours}h ago`
          : days < DAYS_PER_WEEK
            ? `${days}d ago`
            : weeks < WEEKS_SHOWN_BEFORE_MONTHS
              ? `${weeks}w ago`
              : months < MONTHS_PER_YEAR
                ? `${months}mo ago`
                : `${years}y ago`

  return Option.some({ relative, full: new Date(parsed).toLocaleDateString() })
}

export const computeMatches = (
  items: ReadonlyArray<ProwlarrResult>,
  series: ReadonlyArray<KomgaSeries>,
): Readonly<Record<string, MatchResult>> =>
  Arr.isReadonlyArrayEmpty(series)
    ? {}
    : Object.fromEntries(
        Arr.getSomes(
          items.map((item) =>
            Option.map(Option.fromNullishOr(findBestMatch(item.title, series)), (match) => [
              item.guid,
              match,
            ]),
          ),
        ),
      )

const seriesOf = (model: Model): ReadonlyArray<KomgaSeries> =>
  Option.getOrElse(AsyncData.getData(model.series), () => [])

export const selectedItems = (model: Model): ReadonlyArray<ProwlarrResult> =>
  model.items.filter((item) => model.selected.includes(item.guid))

export const isAllSelected = (model: Model): boolean =>
  Arr.isReadonlyArrayNonEmpty(model.items) &&
  model.items.every((item) => model.selected.includes(item.guid))

export const matchLabel = (match: MatchResult): string =>
  `In Komga · ${match.seriesName} · ${match.booksCount} ${match.booksCount === 1 ? "book" : "books"}`

// COMMAND

export const FetchSeries = Command.define("FetchSeries", {
  messages: [Message.SucceededFetchSeries, Message.FailedFetchSeries],
  execute: callApi((client) => client.komga.series({ payload: {} })).pipe(
    Effect.match({
      onSuccess: (series) => Message.SucceededFetchSeries({ series }),
      onFailure: ({ message }) => Message.FailedFetchSeries({ reason: message }),
    }),
  ),
})

export const SaveMagnet = Command.define("SaveMagnet", {
  args: {
    guid: Schema.String,
    listVersion: Schema.Int,
    magnetUrl: Schema.NullOr(Schema.String),
    downloadUrl: Schema.NullOr(Schema.String),
  },
  messages: [Message.SucceededSaveMagnet, Message.FailedSaveMagnet],
  execute: ({ guid, listVersion, magnetUrl, downloadUrl }) =>
    callApi((client) => client.alldebrid.saveMagnet({ payload: { magnetUrl, downloadUrl } })).pipe(
      Effect.match({
        onSuccess: () => Message.SucceededSaveMagnet({ guid, listVersion }),
        onFailure: ({ message }) =>
          Message.FailedSaveMagnet({ guid, listVersion, reason: message }),
      }),
    ),
})

// INIT

type UpdateReturn = Update.Return<Model, Message, ApiClientService>

export const init = (): Model => ({
  items: [],
  selected: [],
  saves: {},
  series: SeriesData.Idle(),
  matches: {},
  nowMillis: 0,
  listVersion: 0,
})

/**
 * Fetch the Komga series if we don't have them (or last time failed). Silent
 * on failure: without series rows just have no badge. Pages call this when
 * they are entered, so a big library is only fetched where it's used.
 */
export const ensureSeries = (model: Model): UpdateReturn =>
  Option.match(AsyncData.loadIfMissing(model.series), {
    onNone: () => ({ model }),
    onSome: (series) => ({
      model: modifyFields(model, { series: () => series }),
      commands: [FetchSeries()],
    }),
  })

// UPDATE

/** New items replace the old; selection and save marks belong to the old ones. */
export const setItems = (
  model: Model,
  items: ReadonlyArray<ProwlarrResult>,
  nowMillis: number,
): Model => {
  // Indexers can return the same release twice; one row, one selection.
  const uniqueItems = Arr.dedupeWith(items, (left, right) => left.guid === right.guid)

  return modifyFields(model, {
    items: () => uniqueItems,
    selected: () => [],
    saves: () => ({}),
    matches: () => computeMatches(uniqueItems, seriesOf(model)),
    nowMillis: () => nowMillis,
    listVersion: (version) => version + 1,
  })
}

export const clearSelection = (model: Model): Model => modifyFields(model, { selected: () => [] })

const setSave = (model: Model, guid: string, state: SaveState): Model =>
  modifyFields(model, { saves: (saves) => ({ ...saves, [guid]: state }) })

/** An answer only counts if it is about the current list and a save we are waiting on. */
const isPendingSave = (model: Model, guid: string, listVersion: number): boolean =>
  listVersion === model.listVersion &&
  Option.exists(lookup(model.saves, guid), (state) => state._tag === "Saving")

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    ToggledResult: ({ guid }) => ({
      model: modifyFields(model, {
        selected: (selected) =>
          !model.items.some((item) => item.guid === guid)
            ? selected
            : selected.includes(guid)
              ? selected.filter((picked) => picked !== guid)
              : [...selected, guid],
      }),
    }),

    ToggledAll: () => ({
      model: modifyFields(model, {
        selected: () => (isAllSelected(model) ? [] : model.items.map((item) => item.guid)),
      }),
    }),

    ClickedSaveToAllDebrid: ({ guid }) => {
      const maybeItem = Arr.findFirst(model.items, (item) => item.guid === guid)
      const isBusy = Option.exists(lookup(model.saves, guid), (state) => state._tag === "Saving")

      return Option.isNone(maybeItem) || isBusy
        ? { model }
        : {
            model: setSave(model, guid, SaveState.Saving()),
            commands: [
              SaveMagnet({
                guid,
                listVersion: model.listVersion,
                magnetUrl: maybeItem.value.magnetUrl,
                downloadUrl: maybeItem.value.downloadUrl,
              }),
            ],
          }
    },

    SucceededSaveMagnet: ({ guid, listVersion }) => ({
      model: isPendingSave(model, guid, listVersion)
        ? setSave(model, guid, SaveState.Saved())
        : model,
    }),

    FailedSaveMagnet: ({ guid, listVersion, reason }) => ({
      model: isPendingSave(model, guid, listVersion)
        ? setSave(model, guid, SaveState.Failed({ reason }))
        : model,
    }),

    SucceededFetchSeries: ({ series }) => ({
      model: modifyFields(model, {
        series: () => SeriesData.Success({ data: series }),
        matches: () => computeMatches(model.items, series),
      }),
    }),

    FailedFetchSeries: ({ reason }) => ({
      model: modifyFields(model, { series: () => SeriesData.Failure({ error: reason }) }),
    }),
  })

// VIEW

type ViewInputs = Readonly<{ idPrefix: string }>

const saveGlyph = (state: Option.Option<SaveState>): string =>
  Option.match(state, {
    onNone: () => "⇩",
    onSome: (current) =>
      SaveState.match<string>(current, {
        Saving: () => "…",
        Saved: () => "✓",
        Failed: () => "✕",
      }),
  })

export const saveLabel = (state: Option.Option<SaveState>): string =>
  Option.match(state, {
    onNone: () => "Save to AllDebrid",
    onSome: (current) =>
      SaveState.match<string>(current, {
        Saving: () => "Saving to AllDebrid…",
        Saved: () => "Saved to AllDebrid",
        Failed: ({ reason }) => (reason === "" ? "Failed to save to AllDebrid" : reason),
      }),
  })

export const view = Submodel.defineView<Model, Message, ViewInputs>(
  (model, { idPrefix }, h): Html => {
    if (Arr.isReadonlyArrayEmpty(model.items)) {
      return h.div([])
    }

    const allSelected = isAllSelected(model)
    const someSelected = Arr.isReadonlyArrayNonEmpty(model.selected) && !allSelected

    const selectAll = (id: string, showLabel: boolean): Html =>
      Checkbox.view(
        {
          id,
          isChecked: allSelected,
          isIndeterminate: someSelected,
          onToggle: () => Message.ToggledAll(),
          toView: ({ checkbox, label }) =>
            h.div(
              [h.Class("flex items-center gap-2.5")],
              [
                h.button(
                  [...checkbox, h.Id(id), h.Class(checkboxClass)],
                  [allSelected ? "✓" : someSelected ? "–" : ""],
                ),
                h.span(
                  [
                    ...label,
                    h.Class(
                      showLabel
                        ? "font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary"
                        : "sr-only",
                    ),
                  ],
                  ["Select all"],
                ),
              ],
            ),
        },
        h,
      )

    const saveButton = (item: ProwlarrResult): Html => {
      const state = lookup(model.saves, item.guid)
      const label = saveLabel(state)

      return h.button(
        [
          h.Type("button"),
          h.Title(label),
          h.AriaLabel(`${label}: ${item.title}`),
          h.Disabled(Option.exists(state, (current) => current._tag === "Saving")),
          h.DataAttribute("save", item.guid),
          h.OnClick(Message.ClickedSaveToAllDebrid({ guid: item.guid })),
          h.Class(
            "flex h-6 w-6 items-center justify-center rounded-[2px] text-secondary transition hover:bg-surface-hover hover:text-primary disabled:cursor-not-allowed",
          ),
        ],
        [saveGlyph(state)],
      )
    }

    // Only the title labels the checkbox; the badge and details sit beside it.
    const rowCheckbox = (item: ProwlarrResult, id: string, extra: ReadonlyArray<Html>): Html =>
      Checkbox.view(
        {
          id,
          isChecked: model.selected.includes(item.guid),
          onToggle: () => Message.ToggledResult({ guid: item.guid }),
          toView: ({ checkbox, label }) =>
            h.div(
              [h.Class("flex min-w-0 flex-1 items-start gap-3")],
              [
                h.button(
                  [...checkbox, h.Id(id), h.Class(`${checkboxClass} mt-1`)],
                  [model.selected.includes(item.guid) ? "✓" : ""],
                ),
                h.div(
                  [h.Class("min-w-0 flex-1")],
                  [
                    h.span(
                      [
                        ...label,
                        h.Class("block cursor-pointer break-words font-display text-primary"),
                      ],
                      [item.title],
                    ),
                    ...matchBadge(item),
                    ...extra,
                  ],
                ),
              ],
            ),
        },
        h,
      )

    const matchBadge = (item: ProwlarrResult): ReadonlyArray<Html> =>
      Option.match(lookup(model.matches, item.guid), {
        onNone: () => [],
        onSome: (match) => [
          h.span(
            [
              h.Title(`Komga match score: ${(match.score * 100).toFixed(0)}%`),
              h.Class("status-pill mt-1 font-mono text-[10px] text-accent-hover"),
            ],
            [matchLabel(match)],
          ),
        ],
      })

    const dateCell = (item: ProwlarrResult): Html =>
      Option.match(formatRelativeTime(model.nowMillis, item.publishDate), {
        onNone: () => h.span([h.Class("text-secondary")], ["—"]),
        onSome: ({ relative, full }) => h.span([h.Title(full)], [relative]),
      })

    const card = (item: ProwlarrResult, index: number): Html =>
      h.keyed("div")(
        item.guid,
        [
          h.DataAttribute("guid", item.guid),
          h.Class(
            `flex gap-3 rounded-sm border p-3 transition ${
              model.selected.includes(item.guid)
                ? "border-accent bg-accent-tint"
                : "border-border hover:bg-surface-hover"
            }`,
          ),
        ],
        [
          rowCheckbox(item, `${idPrefix}-card-${index}`, [
            h.div(
              [
                h.Class(
                  "mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-secondary",
                ),
              ],
              [
                h.span([h.DataAttribute("col", "date")], [dateCell(item)]),
                h.span([h.DataAttribute("col", "size")], [formatSize(item.size)]),
                h.span([h.DataAttribute("col", "seeders")], [`${item.seeders} seeders`]),
                h.span([h.DataAttribute("col", "indexer"), h.Class("truncate")], [item.indexer]),
              ],
            ),
          ]),
          h.div([h.Class("shrink-0")], [saveButton(item)]),
        ],
      )

    const headerCell = (label: string, className = ""): Html =>
      h.th([h.Scope("col"), h.Class(`p-3 ${className}`)], [label])

    const tableRow = (item: ProwlarrResult, index: number): Html =>
      h.keyed("tr")(
        item.guid,
        [
          h.DataAttribute("guid", item.guid),
          h.Class(
            `border-b border-border last:border-0 hover:bg-surface-hover ${index % 2 === 1 ? "bg-surface" : ""}`,
          ),
        ],
        [
          h.td(
            [h.Class("max-w-md p-3 text-primary")],
            [rowCheckbox(item, `${idPrefix}-row-${index}`, [])],
          ),
          h.td(
            [h.DataAttribute("col", "date"), h.Class("p-3 font-mono text-xs text-secondary")],
            [dateCell(item)],
          ),
          h.td(
            [
              h.DataAttribute("col", "size"),
              h.Class("hidden p-3 font-mono text-xs text-secondary md:table-cell"),
            ],
            [formatSize(item.size)],
          ),
          h.td(
            [
              h.DataAttribute("col", "seeders"),
              h.Class("hidden p-3 font-mono text-xs text-secondary lg:table-cell"),
            ],
            [String(item.seeders)],
          ),
          h.td(
            [
              h.DataAttribute("col", "indexer"),
              h.Class("hidden p-3 font-mono text-xs text-secondary lg:table-cell"),
            ],
            [item.indexer],
          ),
          h.td([h.Class("p-3")], [saveButton(item)]),
        ],
      )

    return h.div(
      [],
      [
        h.div(
          [h.DataAttribute("layout", "cards"), h.Class("flex flex-col gap-2 sm:hidden")],
          [
            h.div([h.Class("px-1")], [selectAll(`${idPrefix}-card-all`, true)]),
            ...model.items.map(card),
          ],
        ),
        h.div(
          [
            h.DataAttribute("layout", "table"),
            h.Class("hidden overflow-x-auto rounded-sm border border-border sm:block"),
          ],
          [
            h.table(
              [h.Class("w-full text-sm")],
              [
                h.thead(
                  [],
                  [
                    h.tr(
                      [
                        h.Class(
                          "border-b-2 border-primary/60 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary",
                        ),
                      ],
                      [
                        h.th(
                          [h.Scope("col"), h.Class("p-3")],
                          [selectAll(`${idPrefix}-row-all`, false)],
                        ),
                        headerCell("Title"),
                        headerCell("Date"),
                        headerCell("Size", "hidden md:table-cell"),
                        headerCell("Seeders", "hidden lg:table-cell"),
                        headerCell("Indexer", "hidden lg:table-cell"),
                        headerCell("Actions"),
                      ],
                    ),
                  ],
                ),
                h.tbody([], model.items.map(tableRow)),
              ],
            ),
          ],
        ),
      ],
    )
  },
)

const checkboxClass =
  "flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border border-border bg-surface text-xs leading-none text-on-accent transition-colors aria-checked:border-accent aria-checked:bg-accent aria-[checked=mixed]:border-accent aria-[checked=mixed]:bg-accent"
