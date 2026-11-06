import type { Html, HtmlBuilder } from "foldkit/html"

/** Roman-numeral eyebrow + display title, shared by every page. */
export const pageHeader = <M>(
  h: HtmlBuilder<M>,
  config: {
    readonly title: string
    readonly numeral?: string
    readonly label?: string
    /** Replaces the numeral/label eyebrow entirely. */
    readonly eyebrow?: string
    /** Right-aligned mono stat, e.g. "1,204 series". */
    readonly meta?: string
  },
): Html => {
  const eyebrow =
    config.eyebrow ?? `${config.numeral ?? ""} — ${(config.label ?? "").toUpperCase()}`

  return h.div(
    [h.Class("mb-4")],
    [
      h.div(
        [
          h.Class(
            "flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border pb-4",
          ),
        ],
        [
          h.div(
            [],
            [
              h.p(
                [
                  h.Class(
                    "font-mono text-xs font-semibold uppercase tracking-[0.15em] text-accent",
                  ),
                ],
                [eyebrow],
              ),
              h.h1([h.Class("display-title mt-1 text-3xl font-bold text-primary")], [config.title]),
            ],
          ),
          ...(config.meta === undefined || config.meta === ""
            ? []
            : [h.p([h.Class("shrink-0 pb-1 font-mono text-xs text-secondary")], [config.meta])]),
        ],
      ),
    ],
  )
}
