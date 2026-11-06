import { KccConfigSchema } from "@inkpipe/shared"
import { Option, Schema } from "effect"
import { describe, expect, test } from "vitest"

import * as Kcc from "./kccOptions"

const defaults = Option.getOrThrowWith(
  Schema.decodeUnknownOption(KccConfigSchema)({}),
  () => new globalThis.Error("defaults must decode"),
)
const fresh = () => Kcc.init(defaults)

describe("parseNumberField", () => {
  test.each([
    ["gamma", "1", 1],
    ["gamma", " 0.1 ", 0.1],
    ["gamma", "2.5", 2.5],
    ["croppingPower", "1.5", 1.5],
    ["targetSize", "0", 0],
    ["targetSize", "4096", 4096],
    ["customWidth", "1072", 1072],
  ] as const)("%s accepts %j", (field, text, expected) => {
    expect(Kcc.parseNumberField(field, text)).toStrictEqual(Option.some(expected))
  })

  test.each([
    ["gamma", ""],
    ["gamma", "   "],
    ["gamma", "abc"],
    ["gamma", "0.05"],
    ["gamma", "-1"],
    ["gamma", "Infinity"],
    ["gamma", "NaN"],
    ["targetSize", "1.5"],
    ["targetSize", "-1"],
    ["targetSize", ""],
    ["customWidth", ""],
    ["customHeight", "12px"],
  ] as const)("%s rejects %j", (field, text) => {
    expect(Kcc.parseNumberField(field, text)).toStrictEqual(Option.none())
  })
})

describe("init", () => {
  test("drafts mirror the config", () => {
    const model = fresh()
    expect(model.numberDrafts).toStrictEqual({
      gamma: "1",
      croppingPower: "1",
      targetSize: "0",
      customWidth: "0",
      customHeight: "0",
    })
    expect(Kcc.isValid(model)).toBe(true)
  })
})

describe("update", () => {
  test("text fields", () => {
    const next = Kcc.update(fresh(), Kcc.Message.ChangedText({ field: "profile", value: "KPW5" }))
    expect(next.value.profile).toBe("KPW5")
    expect(next.value.dockerImage).toBe(defaults.dockerImage)
  })

  test.each(Kcc.KccFlagField.literals)("toggling %s changes only that flag", (field) => {
    const before = fresh()
    const next = Kcc.update(
      before,
      Kcc.Message.ToggledFlag({ field, isChecked: !before.value[field] }),
    )
    const changed = Object.keys(next.value).filter(
      (key) =>
        next.value[key as keyof typeof next.value] !==
        before.value[key as keyof typeof before.value],
    )
    expect(changed).toStrictEqual([field])
  })

  test("choices accept their own values and ignore anything else", () => {
    const m = fresh()
    expect(
      Kcc.update(m, Kcc.Message.ChangedChoice({ field: "format", value: "EPUB" })).value.format,
    ).toBe("EPUB")
    expect(
      Kcc.update(m, Kcc.Message.ChangedChoice({ field: "cropping", value: "2" })).value.cropping,
    ).toBe("2")
    expect(
      Kcc.update(m, Kcc.Message.ChangedChoice({ field: "format", value: "DOCX" })),
    ).toStrictEqual(m)
    expect(
      Kcc.update(m, Kcc.Message.ChangedChoice({ field: "splitter", value: "9" })),
    ).toStrictEqual(m)
    // a format value is not a valid cropping value
    expect(
      Kcc.update(m, Kcc.Message.ChangedChoice({ field: "cropping", value: "EPUB" })),
    ).toStrictEqual(m)
  })

  test("a valid number updates both the draft and the value", () => {
    const next = Kcc.update(fresh(), Kcc.Message.ChangedNumber({ field: "gamma", text: "1.8" }))
    expect(next.numberDrafts.gamma).toBe("1.8")
    expect(next.value.gamma).toBe(1.8)
    expect(Kcc.isValid(next)).toBe(true)
  })

  test("an invalid number updates only the draft, and blocks validity until fixed", () => {
    const typed = Kcc.update(fresh(), Kcc.Message.ChangedNumber({ field: "gamma", text: "1." }))
    // "1." is a perfectly good number mid-typing
    expect(typed.value.gamma).toBe(1)
    const broken = Kcc.update(typed, Kcc.Message.ChangedNumber({ field: "gamma", text: "x" }))
    expect(broken.numberDrafts.gamma).toBe("x")
    expect(broken.value.gamma).toBe(1)
    expect(Kcc.isValid(broken)).toBe(false)
    expect(Kcc.numberError(broken, "gamma")).toStrictEqual(Option.some("Enter a number ≥ 0.1"))
    expect(Kcc.numberError(broken, "targetSize")).toStrictEqual(Option.none())
    const fixed = Kcc.update(broken, Kcc.Message.ChangedNumber({ field: "gamma", text: "2" }))
    expect(fixed.value.gamma).toBe(2)
    expect(Kcc.isValid(fixed)).toBe(true)
  })

  test("integer fields say so", () => {
    expect(Kcc.numberErrorText("targetSize")).toBe("Enter a whole number ≥ 0")
  })
})

describe("tables are wired to the right fields", () => {
  test.each(Kcc.KccFlagField.literals)(
    "flag %s reads back what was written, others unchanged",
    (field) => {
      const before = fresh().value
      const next = Kcc.update(
        fresh(),
        Kcc.Message.ToggledFlag({ field, isChecked: !Kcc.flagValue(before, field) }),
      ).value
      expect(Kcc.flagValue(next, field)).toBe(!Kcc.flagValue(before, field))
      for (const other of Kcc.KccFlagField.literals.filter((f) => f !== field)) {
        expect(Kcc.flagValue(next, other)).toBe(Kcc.flagValue(before, other))
      }
    },
  )

  const choiceCases = [
    ["format", "PDF"],
    ["cropping", "2"],
    ["splitter", "2"],
    ["batchSplit", "2"],
  ] as const

  test.each(choiceCases)("choice %s -> %s reads back, others unchanged", (field, value) => {
    const before = fresh().value
    const next = Kcc.update(fresh(), Kcc.Message.ChangedChoice({ field, value })).value
    expect(Kcc.choiceValue(next, field)).toBe(value)
    for (const other of Kcc.KccChoiceField.literals.filter((f) => f !== field)) {
      expect(Kcc.choiceValue(next, other)).toBe(Kcc.choiceValue(before, other))
    }
  })

  test.each(Kcc.KccNumberField.literals)("number %s changes only itself", (field) => {
    const before = fresh()
    const next = Kcc.update(before, Kcc.Message.ChangedNumber({ field, text: "7" })).value
    expect(next[field]).toBe(7)
    for (const other of Kcc.KccNumberField.literals.filter((f) => f !== field)) {
      expect(next[other]).toBe(before.value[other])
    }
  })

  test("text fields write only themselves", () => {
    const next = Kcc.update(
      fresh(),
      Kcc.Message.ChangedText({ field: "dockerImage", value: "img:1" }),
    ).value
    expect(next.dockerImage).toBe("img:1")
    expect(next.profile).toBe(defaults.profile)
  })
})

describe("invalidCount", () => {
  test("counts every unacceptable number input", () => {
    const one = Kcc.update(fresh(), Kcc.Message.ChangedNumber({ field: "gamma", text: "x" }))
    const two = Kcc.update(one, Kcc.Message.ChangedNumber({ field: "targetSize", text: "" }))
    expect(Kcc.invalidCount(fresh())).toBe(0)
    expect(Kcc.invalidCount(one)).toBe(1)
    expect(Kcc.invalidCount(two)).toBe(2)
  })
})
