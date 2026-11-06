import { Match, Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"
import type { EntryHandlers } from "@foldkit/ui/toast"

import type { Toast } from "./toast"

type Entry = typeof Toast.Entry.Type

const accentClass = (variant: Entry["variant"]): string =>
  Match.value(variant).pipe(
    Match.when("Info", () => "border-l-secondary"),
    Match.when("Success", () => "border-l-success"),
    Match.when("Warning", () => "border-l-warning"),
    Match.when("Error", () => "border-l-accent"),
    Match.exhaustive,
  )

export const toastEntryClass = "w-80 max-w-[calc(100vw-2rem)]"

export const toastEntryView = <M>(entry: Entry, handlers: EntryHandlers, h: HtmlBuilder<M>): Html =>
  h.div(
    [
      h.Class(
        `island-shell relative flex items-start gap-3 rounded-sm border-l-[3px] py-3 pl-4 pr-3 shadow-lg ${accentClass(entry.variant)}`,
      ),
    ],
    [
      h.div(
        [h.Class("min-w-0 flex-1")],
        [
          h.p(
            [h.Class("text-sm font-semibold text-primary")],
            [h.span([h.DataAttribute("toast-swipe-ignore", "")], [entry.payload.title])],
          ),
          ...Option.match(entry.payload.maybeDescription, {
            onNone: () => [],
            onSome: (description) => [
              h.p(
                [h.Class("mt-0.5 break-words text-xs text-secondary")],
                [h.span([h.DataAttribute("toast-swipe-ignore", "")], [description])],
              ),
            ],
          }),
        ],
      ),
      h.button(
        [
          ...handlers.dismiss,
          h.Type("button"),
          h.AriaLabel("Dismiss notification"),
          h.Class("shrink-0 rounded p-0.5 text-secondary hover:text-primary"),
        ],
        ["×"],
      ),
    ],
  )
