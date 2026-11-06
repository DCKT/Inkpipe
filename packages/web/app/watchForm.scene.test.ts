import { Dialog } from "@foldkit/ui"
import type { FilterGroup } from "@inkpipe/shared"
import type { Html, HtmlBuilder } from "foldkit/html"
import {
  Command,
  Mount,
  all,
  click,
  expect as sceneExpect,
  expectAll,
  given,
  label,
  role,
  scene,
  selector,
  text,
  type,
} from "foldkit/scene"
import { describe, test } from "vitest"

import * as Form from "./watchForm"
import { makeWatch } from "./watchFixtures"

const harness = {
  update: (model: Form.Model, message: Form.Message) => Form.update(model, message),
  view: (model: Form.Model, h: HtmlBuilder<Form.Message>): Html =>
    h.submodel({
      slotId: "form",
      model,
      view: Form.view,
      toParentMessage: (message) => message,
    }),
}

const open = (model: Form.Model = Form.openForCreate(Form.init()).model) => [
  given(model),
  Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
]

const create = (patch: Partial<Form.Model> = {}): Form.Model => ({
  ...Form.openForCreate(Form.init()).model,
  ...patch,
})

const group = (mode: "AND" | "OR", ...substrings: ReadonlyArray<string>): FilterGroup => ({
  mode,
  substrings,
})

describe("header and fields", () => {
  test("a new watch says Create; an edit says Edit and shows the watch's values", () => {
    const [g1, m1] = open(create())
    scene(
      harness,
      g1,
      m1,
      sceneExpect(role("dialog", { name: "Create Watch" })).toExist(),
      sceneExpect(role("button", { name: "Create Watch" })).toBeDisabled(),
    )
    const edit = Form.openForEdit(
      Form.init(),
      makeWatch({ id: 7, name: "Berserk", query: "berserk", intervalSeconds: 900 }),
    ).model
    const [g2, m2] = open(edit)
    scene(
      harness,
      g2,
      m2,
      sceneExpect(role("dialog", { name: "Edit Watch" })).toExist(),
      sceneExpect(role("button", { name: "Save Changes" })).toBeEnabled(),
      sceneExpect(label("Name")).toHaveValue("Berserk"),
      sceneExpect(label("Prowlarr Query")).toHaveValue("berserk"),
      sceneExpect(label("Interval (seconds, min 300)")).toHaveValue("900"),
    )
  })

  test("describes itself and explains the folder", () => {
    const [g, m] = open()
    scene(
      harness,
      g,
      m,
      sceneExpect(text("Set up a recurring Prowlarr search with title filters.")).toExist(),
      sceneExpect(label("Name")).toHaveAttr("placeholder", "One Piece - Digital Color"),
      sceneExpect(label("Prowlarr Query")).toHaveAttr("placeholder", "one piece"),
      sceneExpect(
        text(
          "Set a folder to download and convert matches into it. Leave empty to just save matches to AllDebrid instead.",
        ),
      ).toExist(),
    )
  })

  test("typing the name and query enables Save", () => {
    const [g, m] = open()
    scene(
      harness,
      g,
      m,
      type(label("Name"), "One Piece"),
      sceneExpect(role("button", { name: "Create Watch" })).toBeDisabled(),
      type(label("Prowlarr Query"), "one piece"),
      sceneExpect(role("button", { name: "Create Watch" })).toBeEnabled(),
    )
  })
})

describe("filter groups", () => {
  test("with none, it says everything matches", () => {
    const [g, m] = open()
    scene(
      harness,
      g,
      m,
      sceneExpect(text("No filters applied — all results for this query will match.")).toExist(),
    )
  })

  test("Add Group creates a group with one blank substring and hides that message", () => {
    const [g, m] = open()
    scene(
      harness,
      g,
      m,
      click(role("button", { name: "+ Add Group" })),
      sceneExpect(text("No filters applied — all results for this query will match.")).toBeAbsent(),
      sceneExpect(selector("[data-group='0']")).toContainText("Group 1"),
      sceneExpect(label("Group 1, substring 1")).toHaveValue(""),
      sceneExpect(role("button", { name: "Remove group 1" })).toExist(),
    )
  })

  test("typing a substring, adding another and removing it", () => {
    const [g, m] = open(create({ filterGroups: [group("AND", "")] }))
    scene(
      harness,
      g,
      m,
      type(label("Group 1, substring 1"), "color"),
      sceneExpect(label("Group 1, substring 1")).toHaveValue("color"),
      click(role("button", { name: "+ Add substring" })),
      sceneExpect(label("Group 1, substring 2")).toExist(),
      click(role("button", { name: "Remove substring 2 from group 1" })),
      sceneExpect(label("Group 1, substring 2")).toBeAbsent(),
    )
  })

  test("a lone substring has no remove button or Match ALL/ANY switch", () => {
    const [g, m] = open(create({ filterGroups: [group("AND", "a")] }))
    scene(
      harness,
      g,
      m,
      sceneExpect(role("button", { name: "Remove substring 1 from group 1" })).toBeAbsent(),
      sceneExpect(role("button", { name: "Match ALL" })).toBeAbsent(),
    )
  })

  test("with several substrings the mode switch appears, explains itself, and shows the current mode", () => {
    const [g, m] = open(create({ filterGroups: [group("OR", "a", "b")] }))
    scene(
      harness,
      g,
      m,
      sceneExpect(role("button", { name: "Match ALL" })).toHaveAttr(
        "title",
        "Every substring in this group must be present",
      ),
      sceneExpect(role("button", { name: "Match ANY" })).toHaveAttr(
        "title",
        "Any one substring in this group is enough",
      ),
      sceneExpect(role("button", { name: "Match ANY" })).toHaveAttr("aria-pressed", "true"),
      sceneExpect(role("button", { name: "Match ALL" })).toHaveAttr("aria-pressed", "false"),
      click(role("button", { name: "Match ALL" })),
      sceneExpect(role("button", { name: "Match ALL" })).toHaveAttr("aria-pressed", "true"),
    )
  })

  test("the group's mode is written before every substring but the first", () => {
    const [g, m] = open(create({ filterGroups: [group("OR", "a", "b", "c")] }))
    scene(
      harness,
      g,
      m,
      expectAll(all.selector("[data-group='0'] span.w-7")).toHaveCount(3),
      sceneExpect(selector("[data-group='0']")).toContainText("OR"),
    )
  })

  test("groups are joined by an AND pill and an explanation appears from two groups", () => {
    const [g1, m1] = open(create({ filterGroups: [group("AND", "a")] }))
    scene(
      harness,
      g1,
      m1,
      sceneExpect(
        text("A result must match every group below (groups are always combined with AND)."),
      ).toBeAbsent(),
    )
    const [g2, m2] = open(create({ filterGroups: [group("AND", "a"), group("OR", "b")] }))
    scene(
      harness,
      g2,
      m2,
      sceneExpect(
        text("A result must match every group below (groups are always combined with AND)."),
      ).toExist(),
      sceneExpect(text("AND")).toExist(),
      sceneExpect(selector("[data-group='1']")).toContainText("Group 2"),
    )
  })

  test("removing a middle group renumbers the rest", () => {
    const [g, m] = open(
      create({ filterGroups: [group("AND", "a"), group("AND", "b"), group("AND", "c")] }),
    )
    scene(
      harness,
      g,
      m,
      click(role("button", { name: "Remove group 2" })),
      sceneExpect(label("Group 2, substring 1")).toHaveValue("c"),
      sceneExpect(label("Group 3, substring 1")).toBeAbsent(),
    )
  })
})

describe("saving", () => {
  test("clicking Save shows 'Saving...' and sends the request", () => {
    const [g, m] = open(create({ name: "One Piece", query: "one piece" }))
    scene(
      harness,
      g,
      m,
      click(role("button", { name: "Create Watch" })),
      sceneExpect(role("button", { name: "Saving..." })).toBeDisabled(),
      Command.resolve(Form.CreateWatch, Form.Message.FailedSave({ reason: "name taken" })),
      sceneExpect(role("alert")).toContainText("Failed to create watch: name taken"),
      sceneExpect(role("button", { name: "Create Watch" })).toBeEnabled(),
    )
  })

  test("an edit's failure says 'update'", () => {
    const edit = Form.openForEdit(Form.init(), makeWatch({ id: 7 })).model
    const failed = Form.update(edit, Form.Message.FailedSave({ reason: "gone" })).model
    const [g, m] = open(failed)
    scene(harness, g, m, sceneExpect(role("alert")).toContainText("Failed to update watch: gone"))
  })

  test("Save is held while a typed folder is still being checked", () => {
    const checking = Form.update(
      create({ name: "n", query: "q" }),
      Form.Message.GotFolderMessage({ message: { _tag: "ChangedInput", value: "manga" } }),
    ).model
    const [g, m] = open(checking)
    scene(harness, g, m, sceneExpect(role("button", { name: "Create Watch" })).toBeDisabled())
  })
})
