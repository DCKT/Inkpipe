import { String as Str } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { buttonClass, inputClass } from "./form"

/** The search box + button shared by the search pages. */
export const searchForm = <M>(
  h: HtmlBuilder<M>,
  config: {
    readonly inputId: string
    readonly value: string
    /** The accessible name; the placeholder is only a hint. */
    readonly label: string
    readonly placeholder: string
    readonly isSearching: boolean
    readonly onInput: (value: string) => M
    readonly onSubmit: M
  },
): Html => {
  const canSearch = !config.isSearching && Str.trim(config.value) !== ""

  return h.form(
    [h.Class("flex gap-3"), h.OnSubmit(config.onSubmit)],
    [
      h.input([
        h.Id(config.inputId),
        h.Type("text"),
        h.Value(config.value),
        h.OnInput(config.onInput),
        h.AriaLabel(config.label),
        h.Placeholder(config.placeholder),
        h.Autofocus(true),
        h.Class(`${inputClass} px-4 py-3`),
      ]),
      h.div(
        [],
        [
          h.button(
            [h.Type("submit"), h.Disabled(!canSearch), h.Class(buttonClass.submitInline)],
            [config.isSearching ? "Searching..." : "Search"],
          ),
        ],
      ),
    ],
  )
}
