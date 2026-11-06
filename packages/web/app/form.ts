import { Checkbox, Fieldset, Input, Select } from "@foldkit/ui"
import { Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

// Shared form renderers. Everything here is a pure view helper over Foldkit's
// stateless UI primitives; the state lives in whichever Model owns the form.

export const labelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-accent"
export const inputClass =
  "w-full rounded-[3px] border border-border bg-surface px-4 py-2.5 text-sm text-primary placeholder:text-secondary focus:border-accent focus:outline-none aria-[invalid=true]:border-red-500"

export const buttonClass = {
  primary:
    "rounded-[3px] bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:opacity-50",
  secondary:
    "rounded-[3px] border-[1.5px] border-primary px-5 py-2 text-sm font-semibold text-primary transition hover:bg-surface-2 disabled:opacity-50",
  refresh:
    "rounded-[3px] border border-border px-4 py-2 text-sm font-semibold text-secondary transition hover:bg-surface-2 disabled:opacity-50",
  submitInline:
    "rounded-[3px] border-[1.5px] border-accent bg-accent-tint px-6 py-3 text-sm font-semibold text-accent-hover transition hover:bg-accent/20 disabled:opacity-50",
  submit:
    "w-full rounded-[3px] border-[1.5px] border-accent bg-accent-tint px-6 py-3 text-sm font-semibold text-accent-hover transition hover:bg-accent/20 disabled:opacity-50",
} as const

export type SelectOption = Readonly<{ value: string; label: string }>

/** A card with a stamped legend, wrapping a group of fields. */
export const fieldsetCard = <M>(
  h: HtmlBuilder<M>,
  { id, legend, children }: { id: string; legend: string; children: ReadonlyArray<Html> },
): Html =>
  Fieldset.view(
    {
      id,
      toView: ({ fieldset, legend: legendAttrs }) =>
        h.fieldset(
          [...fieldset, h.Class("island-shell rounded-2xl p-6")],
          [
            h.legend([...legendAttrs, h.Class("island-kicker mb-3 px-1")], [legend]),
            h.div([h.Class("space-y-4")], children),
          ],
        ),
    },
    h,
  )

export const subheading = <M>(h: HtmlBuilder<M>, text: string): Html =>
  h.p([h.Class("mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-secondary")], [text])

export const textField = <M>(
  h: HtmlBuilder<M>,
  config: {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly onInput: (value: string) => M
    readonly type?: string
    readonly placeholder?: string
    readonly description?: string
    readonly error?: Option.Option<string>
    readonly isDisabled?: boolean
    readonly step?: string
    readonly min?: string
  },
): Html => {
  const error = config.error ?? Option.none()

  return Input.view(
    {
      id: config.id,
      value: config.value,
      onInput: config.onInput,
      type: config.type ?? "text",
      isDisabled: config.isDisabled ?? false,
      isInvalid: Option.isSome(error),
      hasDescription: config.description !== undefined,
      ...(config.placeholder === undefined ? {} : { placeholder: config.placeholder }),
      toView: ({ input, label, description }) =>
        h.div(
          [],
          [
            h.label([...label, h.Class(labelClass)], [config.label]),
            h.input([
              ...input,
              h.Class(inputClass),
              ...(config.step === undefined ? [] : [h.Step(config.step)]),
              ...(config.min === undefined ? [] : [h.Min(config.min)]),
            ]),
            ...(config.description === undefined
              ? []
              : [
                  h.p(
                    [...description, h.Class("mt-1 text-xs text-secondary")],
                    [config.description],
                  ),
                ]),
            ...Option.match(error, {
              onNone: () => [],
              onSome: (message) => [
                h.p([h.Role("alert"), h.Class("mt-1 text-xs text-red-600")], [message]),
              ],
            }),
          ],
        ),
    },
    h,
  )
}

export const checkboxField = <M>(
  h: HtmlBuilder<M>,
  config: {
    readonly id: string
    readonly label: string
    readonly isChecked: boolean
    readonly onToggle: (isChecked: boolean) => M
  },
): Html =>
  Checkbox.view(
    {
      id: config.id,
      isChecked: config.isChecked,
      onToggle: config.onToggle,
      toView: ({ checkbox, label }) =>
        h.div(
          [h.Class("flex items-center gap-2.5")],
          [
            h.button(
              [
                ...checkbox,
                h.Class(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border border-border bg-surface text-xs leading-none text-on-accent transition-colors aria-checked:border-accent aria-checked:bg-accent",
                ),
              ],
              config.isChecked ? ["✓"] : [],
            ),
            h.span([...label, h.Class("select-none text-sm text-primary")], [config.label]),
          ],
        ),
    },
    h,
  )

export const selectField = <M>(
  h: HtmlBuilder<M>,
  config: {
    readonly id: string
    readonly label: string
    readonly value: string
    readonly options: ReadonlyArray<SelectOption>
    readonly onChange: (value: string) => M
    readonly isDisabled?: boolean
  },
): Html =>
  Select.view(
    {
      id: config.id,
      value: config.value,
      onChange: config.onChange,
      isDisabled: config.isDisabled ?? false,
      toView: ({ select, label }) =>
        h.div(
          [],
          [
            h.label([...label, h.Class(labelClass)], [config.label]),
            h.select(
              [...select, h.Class(inputClass)],
              config.options.map((option) =>
                h.option(
                  [h.Value(option.value), h.Selected(option.value === config.value)],
                  [option.label],
                ),
              ),
            ),
          ],
        ),
    },
    h,
  )
