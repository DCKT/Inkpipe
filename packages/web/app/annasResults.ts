import { type AnnasArchiveResult, AnnasArchiveResultSchema } from "@inkpipe/shared"
import { Checkbox } from "@foldkit/ui"
import { Array as Arr, Option, Schema } from "effect"
import { Submodel } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

// A selectable list of Anna's Archive books (cover, author, language, format).

export const ANNAS_ARCHIVE_URL = "https://annas-archive.gl"

// MODEL

export const Model = Schema.Struct({
  items: Schema.Array(AnnasArchiveResultSchema),
  /** md5s of the selected books, in pick order. */
  selected: Schema.Array(Schema.String),
  /** md5s whose cover image failed to load (a placeholder is shown instead). */
  failedCovers: Schema.Array(Schema.String),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ToggledResult: { md5: Schema.String },
  ToggledAll: {},
  FailedLoadCover: { md5: Schema.String },
})
export type Message = typeof Message.Type

// PURE HELPERS

export const init = (): Model => ({ items: [], selected: [], failedCovers: [] })

/** New items replace the old; one row per md5 even if the search repeats a book. */
export const setItems = (model: Model, items: ReadonlyArray<AnnasArchiveResult>): Model =>
  modifyFields(model, {
    items: () => Arr.dedupeWith(items, (left, right) => left.md5 === right.md5),
    selected: () => [],
    failedCovers: () => [],
  })

export const clearSelection = (model: Model): Model => modifyFields(model, { selected: () => [] })

export const selectedItems = (model: Model): ReadonlyArray<AnnasArchiveResult> =>
  model.items.filter((item) => model.selected.includes(item.md5))

export const isAllSelected = (model: Model): boolean =>
  Arr.isReadonlyArrayNonEmpty(model.items) &&
  model.items.every((item) => model.selected.includes(item.md5))

export const detailsUrl = (md5: string): string => `${ANNAS_ARCHIVE_URL}/md5/${md5}`
export const slowDownloadUrl = (md5: string): string =>
  `${ANNAS_ARCHIVE_URL}/slow_download/${md5}/0/0`

// UPDATE

const toggleIn = (picked: ReadonlyArray<string>, md5: string): ReadonlyArray<string> =>
  picked.includes(md5) ? picked.filter((other) => other !== md5) : [...picked, md5]

export const update = (model: Model, message: Message): Model =>
  Message.match<Model>(message, {
    ToggledResult: ({ md5 }) =>
      modifyFields(model, {
        selected: (selected) =>
          model.items.some((item) => item.md5 === md5) ? toggleIn(selected, md5) : selected,
      }),

    ToggledAll: () =>
      modifyFields(model, {
        selected: () => (isAllSelected(model) ? [] : model.items.map((item) => item.md5)),
      }),

    FailedLoadCover: ({ md5 }) =>
      model.failedCovers.includes(md5)
        ? model
        : modifyFields(model, { failedCovers: (covers) => [...covers, md5] }),
  })

// VIEW

type ViewInputs = Readonly<{ idPrefix: string }>

const checkboxClass =
  "flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border border-border bg-surface text-xs leading-none text-on-accent transition-colors aria-checked:border-accent aria-checked:bg-accent aria-[checked=mixed]:border-accent aria-[checked=mixed]:bg-accent"

const iconLinkClass =
  "flex h-6 w-6 items-center justify-center rounded-[2px] text-secondary transition hover:bg-surface-hover hover:text-primary"

export const view = Submodel.defineView<Model, Message, ViewInputs>(
  (model, { idPrefix }, h): Html => {
    if (Arr.isReadonlyArrayEmpty(model.items)) {
      return h.div([])
    }

    const allSelected = isAllSelected(model)
    const someSelected = Arr.isReadonlyArrayNonEmpty(model.selected) && !allSelected

    const selectAll = Checkbox.view(
      {
        id: `${idPrefix}-all`,
        isChecked: allSelected,
        isIndeterminate: someSelected,
        onToggle: () => Message.ToggledAll(),
        toView: ({ checkbox, label }) =>
          h.div(
            [h.Class("flex items-center gap-2.5 px-1")],
            [
              h.button(
                [...checkbox, h.Id(`${idPrefix}-all`), h.Class(checkboxClass)],
                [allSelected ? "✓" : someSelected ? "–" : ""],
              ),
              h.span(
                [
                  ...label,
                  h.Class(
                    "font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary",
                  ),
                ],
                ["Select all"],
              ),
            ],
          ),
      },
      h,
    )

    const cover = (item: AnnasArchiveResult): Html =>
      Option.match(
        Option.filter(
          Option.fromNullishOr(item.coverUrl),
          () => !model.failedCovers.includes(item.md5),
        ),
        {
          onNone: () =>
            h.div(
              [
                h.AriaHidden(true),
                h.Class("flex h-full w-full items-center justify-center text-secondary/50"),
              ],
              ["📖"],
            ),
          onSome: (url) =>
            h.img([
              h.Src(url),
              h.Alt(""),
              h.Loading("lazy"),
              h.Referrerpolicy("no-referrer"),
              h.OnError(Message.FailedLoadCover({ md5: item.md5 })),
              h.Class("h-full w-full object-cover"),
            ]),
        },
      )

    const card = (item: AnnasArchiveResult, index: number): Html => {
      const isSelected = model.selected.includes(item.md5)
      const id = `${idPrefix}-${index}`

      return h.keyed("div")(
        item.md5,
        [
          h.DataAttribute("md5", item.md5),
          h.Class(
            `relative flex gap-4 rounded-sm border p-3 transition ${
              isSelected ? "border-accent bg-accent-tint" : "border-border hover:bg-surface-hover"
            }`,
          ),
        ],
        [
          h.div(
            [h.Class("absolute right-2 top-2 flex items-center gap-1")],
            [
              h.a(
                [
                  h.Href(detailsUrl(item.md5)),
                  h.Target("_blank"),
                  h.Rel("noopener noreferrer"),
                  h.Title("View details"),
                  h.AriaLabel(`View details: ${item.title}`),
                  h.Class(iconLinkClass),
                ],
                ["↗"],
              ),
              h.a(
                [
                  h.Href(slowDownloadUrl(item.md5)),
                  h.Target("_blank"),
                  h.Rel("noopener noreferrer"),
                  h.Title("Slow download"),
                  h.AriaLabel(`Slow download: ${item.title}`),
                  h.Class(iconLinkClass),
                ],
                ["⇩"],
              ),
            ],
          ),
          Checkbox.view(
            {
              id,
              isChecked: isSelected,
              onToggle: () => Message.ToggledResult({ md5: item.md5 }),
              toView: ({ checkbox, label }) =>
                h.div(
                  [h.Class("flex min-w-0 flex-1 gap-4")],
                  [
                    h.div(
                      [h.Class("pt-1")],
                      [
                        h.button(
                          [...checkbox, h.Id(id), h.Class(checkboxClass)],
                          [isSelected ? "✓" : ""],
                        ),
                      ],
                    ),
                    h.div(
                      [
                        h.Class(
                          "cover-shell relative aspect-[2/3] w-16 shrink-0 bg-surface sm:w-20",
                        ),
                      ],
                      [cover(item)],
                    ),
                    h.div(
                      [h.Class("flex min-w-0 flex-1 flex-col justify-center gap-1.5")],
                      [
                        h.span(
                          [
                            ...label,
                            h.Class(
                              "block cursor-pointer break-words font-display text-lg text-primary sm:text-xl",
                            ),
                          ],
                          [item.title],
                        ),
                        ...(item.author === null
                          ? []
                          : [h.span([h.Class("truncate text-sm text-secondary")], [item.author])]),
                        h.div(
                          [h.Class("mt-1 flex flex-wrap items-center gap-2")],
                          [
                            ...(item.language === null
                              ? []
                              : [
                                  h.span(
                                    [
                                      h.DataAttribute("field", "language"),
                                      h.Class("status-pill status-pill-accent"),
                                    ],
                                    [item.language],
                                  ),
                                ]),
                            ...(item.extension === null
                              ? []
                              : [
                                  h.span(
                                    [
                                      h.DataAttribute("field", "extension"),
                                      h.Class(
                                        "rounded-[2px] border border-border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-secondary",
                                      ),
                                    ],
                                    [item.extension],
                                  ),
                                ]),
                            ...(item.size === null
                              ? []
                              : [
                                  h.span(
                                    [
                                      h.DataAttribute("field", "size"),
                                      h.Class("font-mono text-xs text-secondary"),
                                    ],
                                    [item.size],
                                  ),
                                ]),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
            },
            h,
          ),
        ],
      )
    }

    return h.div(
      [h.Class("flex flex-col gap-3")],
      [selectAll, h.div([h.Class("flex flex-col gap-2")], model.items.map(card))],
    )
  },
)
