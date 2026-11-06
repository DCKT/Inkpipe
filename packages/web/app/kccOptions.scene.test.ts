import { KccConfigSchema } from "@inkpipe/shared"
import { Option, Schema } from "effect"
import {
  change,
  click,
  expect as sceneExpect,
  given,
  label,
  role,
  scene,
  type,
} from "foldkit/scene"
import type { Html, HtmlBuilder } from "foldkit/html"
import { describe, test } from "vitest"

import * as Kcc from "./kccOptions"

const defaults = Option.getOrThrowWith(
  Schema.decodeUnknownOption(KccConfigSchema)({}),
  () => new globalThis.Error("defaults must decode"),
)

// Mount the Submodel the way a page would.
const harness = (excludeDockerImage: boolean) => ({
  update: (model: Kcc.Model, message: Kcc.Message) => ({ model: Kcc.update(model, message) }),
  view: (model: Kcc.Model, h: HtmlBuilder<Kcc.Message>): Html =>
    h.submodel({
      slotId: "kcc",
      model,
      view: Kcc.view,
      viewInputs: { idPrefix: "kcc", excludeDockerImage },
      toParentMessage: (message) => message,
    }),
})

describe("KCC options view", () => {
  test.each(Kcc.KccFlagField.literals)("checkbox for %s reflects its own flag", (field) => {
    const base = Kcc.init(defaults)
    const flipped = Kcc.update(
      base,
      Kcc.Message.ToggledFlag({ field, isChecked: !base.value[field] }),
    )
    const labelText = Kcc.FLAG_LABELS[field]
    scene(
      harness(true),
      given(flipped),
      sceneExpect(role("checkbox", { name: labelText })).toHaveAttr(
        "aria-checked",
        String(flipped.value[field]),
      ),
    )
  })

  test("shows every section, including the docker image when included", () => {
    scene(
      harness(false),
      given(Kcc.init(defaults)),
      sceneExpect(label("Docker Image")).toExist(),
      sceneExpect(label("Profile")).toExist(),
      sceneExpect(label("Format")).toExist(),
      sceneExpect(label("Gamma")).toExist(),
      sceneExpect(label("Custom Height (0 = auto)")).toExist(),
      sceneExpect(label("Disable Kepub")).toExist(),
    )
  })

  test("hides the docker image when the caller owns it", () => {
    scene(harness(true), given(Kcc.init(defaults)), sceneExpect(label("Docker Image")).toBeAbsent())
  })

  test("checkboxes reflect state and toggle", () => {
    scene(
      harness(true),
      given(Kcc.init(defaults)),
      sceneExpect(role("checkbox", { name: "Manga Style (right-to-left)" })).toHaveAttr(
        "aria-checked",
        "false",
      ),
      click(role("checkbox", { name: "Manga Style (right-to-left)" })),
      sceneExpect(role("checkbox", { name: "Manga Style (right-to-left)" })).toHaveAttr(
        "aria-checked",
        "true",
      ),
    )
  })

  test("an unacceptable number is flagged as you type, and clears when fixed", () => {
    scene(
      harness(true),
      given(Kcc.init(defaults)),
      sceneExpect(role("alert")).toBeAbsent(),
      type(label("Gamma"), "abc"),
      sceneExpect(role("alert")).toContainText("Enter a number ≥ 0.1"),
      sceneExpect(label("Gamma")).toHaveAttr("aria-invalid", "true"),
      type(label("Gamma"), "1.4"),
      sceneExpect(role("alert")).toBeAbsent(),
    )
  })

  test("selects change the value", () => {
    scene(
      harness(true),
      given(Kcc.init(defaults)),
      change(label("Format"), "EPUB"),
      sceneExpect(label("Format")).toHaveValue("EPUB"),
    )
  })
})
