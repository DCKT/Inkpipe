import type { Html, HtmlBuilder } from "foldkit/html"

/** The sticky "Download N selected" button shown while anything is selected. */
export const downloadBar = <M>(
  h: HtmlBuilder<M>,
  config: {
    readonly selectedCount: number
    readonly isStarting: boolean
    readonly onClick: M
  },
): Html =>
  config.selectedCount === 0
    ? h.div([])
    : h.div(
        [h.Class("sticky bottom-4 flex justify-center")],
        [
          h.button(
            [
              h.Type("button"),
              h.Disabled(config.isStarting),
              h.OnClick(config.onClick),
              h.Class(
                "flex items-center gap-2 rounded-[3px] border border-accent bg-surface px-4 py-2 font-mono text-xs font-semibold text-accent shadow-lg transition hover:bg-accent-tint disabled:opacity-50",
              ),
            ],
            [
              h.span(
                [
                  h.AriaHidden(true),
                  h.Class(
                    "flex h-5 w-5 items-center justify-center rounded-[2px] border border-accent",
                  ),
                ],
                ["↓"],
              ),
              config.isStarting ? "Starting..." : `Download ${config.selectedCount} selected`,
            ],
          ),
        ],
      )
