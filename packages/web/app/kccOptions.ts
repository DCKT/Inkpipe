import { type KccConfig, KccConfigSchema } from "@inkpipe/shared"
import { Option, Schema } from "effect"
import { Submodel } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"

import { checkboxField, selectField, subheading, textField } from "./form"

// The KCC (Kindle Comic Converter) option form. Shared by Settings (the saved
// defaults) and Convert (per-conversion overrides), so it is its own Submodel.

// FIELDS

export const KccTextField = Schema.Literals(["dockerImage", "profile"])
export type KccTextField = typeof KccTextField.Type

export const KccFlagField = Schema.Literals([
  "mangaStyle",
  "webtoon",
  "twoPanel",
  "upscale",
  "stretch",
  "hq",
  "forceColor",
  "forcePng",
  "noAutoContrast",
  "blackBorders",
  "whiteBorders",
  "noProcessing",
  "eraseRainbow",
  "coverFill",
  "noKepub",
])
export type KccFlagField = typeof KccFlagField.Type

export const KccChoiceField = Schema.Literals(["format", "cropping", "splitter", "batchSplit"])
export type KccChoiceField = typeof KccChoiceField.Type

export const KccNumberField = Schema.Literals([
  "gamma",
  "croppingPower",
  "targetSize",
  "customWidth",
  "customHeight",
])
export type KccNumberField = typeof KccNumberField.Type

// Setters are written out per field so every assignment is checked against
// `KccConfig` (no computed keys, no casts) and a new field can't be forgotten.

const textSetters: Record<KccTextField, (c: KccConfig, v: string) => KccConfig> = {
  dockerImage: (c, dockerImage) => ({ ...c, dockerImage }),
  profile: (c, profile) => ({ ...c, profile }),
}

const flagSetters: Record<KccFlagField, (c: KccConfig, v: boolean) => KccConfig> = {
  mangaStyle: (c, mangaStyle) => ({ ...c, mangaStyle }),
  webtoon: (c, webtoon) => ({ ...c, webtoon }),
  twoPanel: (c, twoPanel) => ({ ...c, twoPanel }),
  upscale: (c, upscale) => ({ ...c, upscale }),
  stretch: (c, stretch) => ({ ...c, stretch }),
  hq: (c, hq) => ({ ...c, hq }),
  forceColor: (c, forceColor) => ({ ...c, forceColor }),
  forcePng: (c, forcePng) => ({ ...c, forcePng }),
  noAutoContrast: (c, noAutoContrast) => ({ ...c, noAutoContrast }),
  blackBorders: (c, blackBorders) => ({ ...c, blackBorders }),
  whiteBorders: (c, whiteBorders) => ({ ...c, whiteBorders }),
  noProcessing: (c, noProcessing) => ({ ...c, noProcessing }),
  eraseRainbow: (c, eraseRainbow) => ({ ...c, eraseRainbow }),
  coverFill: (c, coverFill) => ({ ...c, coverFill }),
  noKepub: (c, noKepub) => ({ ...c, noKepub }),
}

const FormatValue = Schema.Literals(["Auto", "MOBI", "EPUB", "CBZ", "KFX", "PDF"])
const ThreeWayValue = Schema.Literals(["0", "1", "2"])

/** `None` when `value` isn't one of the field's allowed values. */
const choiceSetters: Record<KccChoiceField, (c: KccConfig, v: string) => Option.Option<KccConfig>> =
  {
    format: (c, v) =>
      Option.map(Schema.decodeUnknownOption(FormatValue)(v), (format) => ({ ...c, format })),
    cropping: (c, v) =>
      Option.map(Schema.decodeUnknownOption(ThreeWayValue)(v), (cropping) => ({ ...c, cropping })),
    splitter: (c, v) =>
      Option.map(Schema.decodeUnknownOption(ThreeWayValue)(v), (splitter) => ({ ...c, splitter })),
    batchSplit: (c, v) =>
      Option.map(Schema.decodeUnknownOption(ThreeWayValue)(v), (batchSplit) => ({
        ...c,
        batchSplit,
      })),
  }

const numberSetters: Record<KccNumberField, (c: KccConfig, v: number) => KccConfig> = {
  gamma: (c, gamma) => ({ ...c, gamma }),
  croppingPower: (c, croppingPower) => ({ ...c, croppingPower }),
  targetSize: (c, targetSize) => ({ ...c, targetSize }),
  customWidth: (c, customWidth) => ({ ...c, customWidth }),
  customHeight: (c, customHeight) => ({ ...c, customHeight }),
}

/** Whether a field takes whole numbers, and its minimum. */
const numberRules: Record<KccNumberField, { readonly integer: boolean; readonly min: number }> = {
  gamma: { integer: false, min: 0.1 },
  croppingPower: { integer: false, min: 0.1 },
  targetSize: { integer: true, min: 0 },
  customWidth: { integer: true, min: 0 },
  customHeight: { integer: true, min: 0 },
}

/** Parse what the user typed, or `None` if it isn't acceptable for the field. */
export const parseNumberField = (field: KccNumberField, text: string): Option.Option<number> => {
  const trimmed = text.trim()
  if (trimmed === "") return Option.none()
  const parsed = Number(trimmed)
  const { integer, min } = numberRules[field]
  return Number.isFinite(parsed) && parsed >= min && (!integer || Number.isInteger(parsed))
    ? Option.some(parsed)
    : Option.none()
}

export const numberErrorText = (field: KccNumberField): string => {
  const { integer, min } = numberRules[field]
  return `Enter ${integer ? "a whole number" : "a number"} ≥ ${min}`
}

// MODEL

const NumberDrafts = Schema.Struct({
  gamma: Schema.String,
  croppingPower: Schema.String,
  targetSize: Schema.String,
  customWidth: Schema.String,
  customHeight: Schema.String,
})
type NumberDrafts = typeof NumberDrafts.Type

export const Model = Schema.Struct({
  /** Last valid configuration; what gets saved or sent to the converter. */
  value: KccConfigSchema,
  /** What's in each number input, valid or not. */
  numberDrafts: NumberDrafts,
})
export type Model = typeof Model.Type

export const init = (value: KccConfig): Model => ({
  value,
  numberDrafts: {
    gamma: String(value.gamma),
    croppingPower: String(value.croppingPower),
    targetSize: String(value.targetSize),
    customWidth: String(value.customWidth),
    customHeight: String(value.customHeight),
  },
})

/** How many number inputs hold something unacceptable (they block saving). */
export const invalidCount = (model: Model): number =>
  KccNumberField.literals.filter((field) =>
    Option.isNone(parseNumberField(field, model.numberDrafts[field])),
  ).length

/** Every number input currently holds something acceptable. */
export const isValid = (model: Model): boolean =>
  KccNumberField.literals.every((field) =>
    Option.isSome(parseNumberField(field, model.numberDrafts[field])),
  )

/** The error to show under a number input, if its draft is unacceptable. */
export const numberError = (model: Model, field: KccNumberField): Option.Option<string> =>
  Option.isSome(parseNumberField(field, model.numberDrafts[field]))
    ? Option.none()
    : Option.some(numberErrorText(field))

// MESSAGE

export const Message = defineMessageUnion({
  ChangedText: { field: KccTextField, value: Schema.String },
  ToggledFlag: { field: KccFlagField, isChecked: Schema.Boolean },
  ChangedChoice: { field: KccChoiceField, value: Schema.String },
  ChangedNumber: { field: KccNumberField, text: Schema.String },
})
export type Message = typeof Message.Type

// UPDATE

export const update = (model: Model, message: Message): Model =>
  Message.match<Model>(message, {
    ChangedText: ({ field, value }) => ({
      ...model,
      value: textSetters[field](model.value, value),
    }),

    ToggledFlag: ({ field, isChecked }) => ({
      ...model,
      value: flagSetters[field](model.value, isChecked),
    }),

    ChangedChoice: ({ field, value }) => ({
      ...model,
      value: Option.getOrElse(choiceSetters[field](model.value, value), () => model.value),
    }),

    // The draft always follows the keyboard; the value only follows valid drafts.
    ChangedNumber: ({ field, text }) => ({
      numberDrafts: { ...model.numberDrafts, [field]: text },
      value: Option.match(parseNumberField(field, text), {
        onNone: () => model.value,
        onSome: (parsed) => numberSetters[field](model.value, parsed),
      }),
    }),
  })

// VIEW

export const KCC_FORMATS = ["Auto", "MOBI", "EPUB", "CBZ", "KFX", "PDF"] as const

const toOptions = (values: ReadonlyArray<string>) =>
  values.map((value) => ({ value, label: value }))

export const CROPPING_OPTIONS = [
  { value: "0", label: "Disabled" },
  { value: "1", label: "Standard" },
  { value: "2", label: "Aggressive" },
] as const

export const SPLITTER_OPTIONS = [
  { value: "0", label: "Disabled" },
  { value: "1", label: "Rotate" },
  { value: "2", label: "Split" },
] as const

export const BATCH_SPLIT_OPTIONS = [
  { value: "0", label: "Disabled" },
  { value: "1", label: "Into chapters" },
  { value: "2", label: "Into volumes" },
] as const

export const FLAG_LABELS: Record<KccFlagField, string> = {
  mangaStyle: "Manga Style (right-to-left)",
  webtoon: "Webtoon mode",
  twoPanel: "Two-panel mode",
  upscale: "Upscale",
  stretch: "Stretch",
  hq: "High quality",
  forceColor: "Force color",
  forcePng: "Force PNG",
  noAutoContrast: "Disable auto contrast",
  blackBorders: "Black borders",
  whiteBorders: "White borders",
  noProcessing: "No processing",
  eraseRainbow: "Erase rainbow",
  coverFill: "Cover fill",
  noKepub: "Disable Kepub",
}

const NUMBER_LABELS: Record<KccNumberField, string> = {
  gamma: "Gamma",
  croppingPower: "Cropping Power",
  targetSize: "Target Size (KB, 0 = auto)",
  customWidth: "Custom Width (0 = auto)",
  customHeight: "Custom Height (0 = auto)",
}

export type ViewInputs = Readonly<{
  /** Prefix for element ids, so two forms on one page don't collide. */
  idPrefix: string
  /** Convert supplies its own image; Settings owns it. */
  excludeDockerImage: boolean
}>

export const view = Submodel.defineView<Model, Message, ViewInputs>(
  (model, { idPrefix, excludeDockerImage }, h): Html => {
    const id = (name: string) => `${idPrefix}-${name}`
    const flag = (field: KccFlagField): Html =>
      checkboxField(h, {
        id: id(field),
        label: FLAG_LABELS[field],
        isChecked: flagValue(model.value, field),
        onToggle: (isChecked) => Message.ToggledFlag({ field, isChecked }),
      })
    const number = (field: KccNumberField): Html =>
      textField(h, {
        id: id(field),
        label: NUMBER_LABELS[field],
        type: "number",
        value: model.numberDrafts[field],
        error: numberError(model, field),
        step: numberRules[field].integer ? "1" : "0.1",
        min: String(numberRules[field].min),
        onInput: (text) => Message.ChangedNumber({ field, text }),
      })
    const choice = (
      field: KccChoiceField,
      label: string,
      options: ReadonlyArray<{ value: string; label: string }>,
    ): Html =>
      selectField(h, {
        id: id(field),
        label,
        value: choiceValue(model.value, field),
        options,
        onChange: (value) => Message.ChangedChoice({ field, value }),
      })

    return h.div(
      [h.Class("space-y-4")],
      [
        subheading(h, "Device & Format"),
        ...(excludeDockerImage
          ? []
          : [
              textField(h, {
                id: id("dockerImage"),
                label: "Docker Image",
                placeholder: "ghcr.io/ciromattia/kcc:latest",
                value: model.value.dockerImage,
                onInput: (value) => Message.ChangedText({ field: "dockerImage", value }),
              }),
            ]),
        textField(h, {
          id: id("profile"),
          label: "Profile",
          placeholder: "KoBO",
          value: model.value.profile,
          onInput: (value) => Message.ChangedText({ field: "profile", value }),
        }),
        choice("format", "Format", toOptions(KCC_FORMATS)),

        subheading(h, "Reading Mode"),
        flag("mangaStyle"),
        flag("webtoon"),
        flag("twoPanel"),

        subheading(h, "Image Processing"),
        flag("upscale"),
        flag("stretch"),
        flag("hq"),
        flag("forceColor"),
        flag("forcePng"),
        flag("noAutoContrast"),
        number("gamma"),
        choice("cropping", "Cropping", CROPPING_OPTIONS),
        number("croppingPower"),

        subheading(h, "Borders"),
        flag("blackBorders"),
        flag("whiteBorders"),

        subheading(h, "Advanced"),
        choice("splitter", "Splitter", SPLITTER_OPTIONS),
        flag("noProcessing"),
        flag("eraseRainbow"),
        flag("coverFill"),

        subheading(h, "Output"),
        choice("batchSplit", "Batch Split", BATCH_SPLIT_OPTIONS),
        number("targetSize"),

        subheading(h, "Device-specific"),
        number("customWidth"),
        number("customHeight"),
        flag("noKepub"),
      ],
    )
  },
)

export const flagValue = (c: KccConfig, field: KccFlagField): boolean => flagReaders[field](c)
export const choiceValue = (c: KccConfig, field: KccChoiceField): string => choiceReaders[field](c)

const flagReaders: Record<KccFlagField, (c: KccConfig) => boolean> = {
  mangaStyle: (c) => c.mangaStyle,
  webtoon: (c) => c.webtoon,
  twoPanel: (c) => c.twoPanel,
  upscale: (c) => c.upscale,
  stretch: (c) => c.stretch,
  hq: (c) => c.hq,
  forceColor: (c) => c.forceColor,
  forcePng: (c) => c.forcePng,
  noAutoContrast: (c) => c.noAutoContrast,
  blackBorders: (c) => c.blackBorders,
  whiteBorders: (c) => c.whiteBorders,
  noProcessing: (c) => c.noProcessing,
  eraseRainbow: (c) => c.eraseRainbow,
  coverFill: (c) => c.coverFill,
  noKepub: (c) => c.noKepub,
}

const choiceReaders: Record<KccChoiceField, (c: KccConfig) => string> = {
  format: (c) => c.format,
  cropping: (c) => c.cropping,
  splitter: (c) => c.splitter,
  batchSplit: (c) => c.batchSplit,
}
