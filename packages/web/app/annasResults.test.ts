import type { Html, HtmlBuilder } from "foldkit/html"
import { click, expect as sceneExpect, given, scene, selector, text } from "foldkit/scene"
import { describe, expect, test } from "vitest"

import * as Books from "./annasResults"
import { makeBook } from "./annasFixtures"

const a = makeBook({ md5: "a", title: "Dune" })
const b = makeBook({
  md5: "b",
  title: "Emma",
  author: null,
  language: null,
  extension: null,
  size: null,
  coverUrl: null,
})
const start = (items = [a, b]) => Books.setItems(Books.init(), items)

describe("model", () => {
  test("setItems dedupes by md5 and resets selection and cover failures", () => {
    const busy = { ...start(), selected: ["a"], failedCovers: ["a"] }
    const next = Books.setItems(busy, [a, b, a])
    expect(next.items.map((i) => i.md5)).toStrictEqual(["a", "b"])
    expect(next.selected).toStrictEqual([])
    expect(next.failedCovers).toStrictEqual([])
  })

  test("toggling keeps pick order, ignores unknown md5s, and select-all toggles", () => {
    let m = start()
    m = Books.update(m, Books.Message.ToggledResult({ md5: "b" }))
    m = Books.update(m, Books.Message.ToggledResult({ md5: "a" }))
    expect(m.selected).toStrictEqual(["b", "a"])
    expect(Books.selectedItems(m).map((i) => i.md5)).toStrictEqual(["a", "b"])
    expect(Books.update(m, Books.Message.ToggledResult({ md5: "zzz" }))).toStrictEqual(m)
    const none = Books.update(m, Books.Message.ToggledAll())
    expect(none.selected).toStrictEqual([])
    expect(Books.update(none, Books.Message.ToggledAll()).selected).toStrictEqual(["a", "b"])
    expect(Books.update(Books.init(), Books.Message.ToggledAll()).selected).toStrictEqual([])
  })

  test("a failed cover is remembered once", () => {
    const m = Books.update(start(), Books.Message.FailedLoadCover({ md5: "a" }))
    expect(m.failedCovers).toStrictEqual(["a"])
    expect(Books.update(m, Books.Message.FailedLoadCover({ md5: "a" }))).toStrictEqual(m)
  })

  test("links point at the book on Anna's Archive", () => {
    expect(Books.detailsUrl("abc")).toBe("https://annas-archive.gl/md5/abc")
    expect(Books.slowDownloadUrl("abc")).toBe("https://annas-archive.gl/slow_download/abc/0/0")
  })
})

const harness = {
  update: (model: Books.Model, message: Books.Message) => ({ model: Books.update(model, message) }),
  view: (model: Books.Model, h: HtmlBuilder<Books.Message>): Html =>
    h.submodel({
      slotId: "books",
      model,
      view: Books.view,
      viewInputs: { idPrefix: "bk" },
      toParentMessage: (message) => message,
    }),
}

describe("view", () => {
  test("renders nothing for an empty list", () => {
    scene(harness, given(start([])), sceneExpect(selector("[data-md5]")).toBeAbsent())
  })

  test("shows title, author, language, format and size when present", () => {
    scene(
      harness,
      given(start()),
      sceneExpect(selector("[data-md5='a']")).toContainText("Dune"),
      sceneExpect(selector("[data-md5='a']")).toContainText("Frank Herbert"),
      sceneExpect(selector("[data-md5='a'] [data-field='language']")).toHaveText("en"),
      sceneExpect(selector("[data-md5='a'] [data-field='extension']")).toHaveText("epub"),
      sceneExpect(selector("[data-md5='a'] [data-field='size']")).toHaveText("1.2MB"),
    )
  })

  test("omits missing details instead of printing 'null'", () => {
    scene(
      harness,
      given(start()),
      sceneExpect(selector("[data-md5='b'] [data-field='language']")).toBeAbsent(),
      sceneExpect(selector("[data-md5='b'] [data-field='extension']")).toBeAbsent(),
      sceneExpect(selector("[data-md5='b'] [data-field='size']")).toBeAbsent(),
      sceneExpect(selector("[data-md5='b'] img")).toBeAbsent(),
    )
  })

  test("a cover is shown until it fails to load", () => {
    scene(
      harness,
      given(start()),
      sceneExpect(selector("[data-md5='a'] img")).toHaveAttr("src", "https://img.test/dune.jpg"),
    )
    scene(
      harness,
      given(Books.update(start(), Books.Message.FailedLoadCover({ md5: "a" }))),
      sceneExpect(selector("[data-md5='a'] img")).toBeAbsent(),
    )
  })

  test("both external links open in a new tab, safely, to the right place, with a name", () => {
    const details = "[data-md5='a'] a[title='View details']"
    const slow = "[data-md5='a'] a[title='Slow download']"
    scene(
      harness,
      given(start()),
      sceneExpect(selector(details)).toHaveAttr("href", "https://annas-archive.gl/md5/a"),
      sceneExpect(selector(details)).toHaveAttr("target", "_blank"),
      sceneExpect(selector(details)).toHaveAttr("rel", "noopener noreferrer"),
      sceneExpect(selector(details)).toHaveAttr("aria-label", "View details: Dune"),
      sceneExpect(selector(slow)).toHaveAttr(
        "href",
        "https://annas-archive.gl/slow_download/a/0/0",
      ),
      sceneExpect(selector(slow)).toHaveAttr("target", "_blank"),
      sceneExpect(selector(slow)).toHaveAttr("rel", "noopener noreferrer"),
      sceneExpect(selector(slow)).toHaveAttr("aria-label", "Slow download: Dune"),
    )
  })

  test("covers load lazily, without sending a referrer, and are decorative", () => {
    scene(
      harness,
      given(start()),
      sceneExpect(selector("[data-md5='a'] img")).toHaveAttr("loading", "lazy"),
      sceneExpect(selector("[data-md5='a'] img")).toHaveAttr("referrerpolicy", "no-referrer"),
      sceneExpect(selector("[data-md5='a'] img")).toHaveAttr("alt", ""),
    )
  })

  test("the placeholder for a missing cover is hidden from screen readers", () => {
    scene(
      harness,
      given(start()),
      sceneExpect(selector("[data-md5='b'] .cover-shell [aria-hidden='true']")).toExist(),
    )
  })

  test("a missing author is not printed as 'null'", () => {
    scene(
      harness,
      given(start()),
      sceneExpect(selector("[data-md5='b']")).not.toContainText("null"),
    )
  })

  test("the checkbox is named by the title; clicking either toggles; the card highlights", () => {
    scene(
      harness,
      given(start()),
      sceneExpect(selector("#bk-0")).toHaveAttr("aria-labelledby", "bk-0-label"),
      sceneExpect(selector("#bk-0-label")).toHaveText("Dune"),
      click(selector("#bk-0-label")),
      sceneExpect(selector("#bk-0")).toHaveAttr("aria-checked", "true"),
      sceneExpect(selector("[data-md5='a']")).toHaveClass("bg-accent-tint"),
      click(selector("#bk-0")),
      sceneExpect(selector("#bk-0")).toHaveAttr("aria-checked", "false"),
    )
  })

  test("select all shows a mixed state when partial, and selects everything", () => {
    scene(
      harness,
      given(start()),
      click(selector("#bk-0")),
      sceneExpect(selector("#bk-all")).toHaveAttr("aria-checked", "mixed"),
      click(selector("#bk-all")),
      sceneExpect(selector("#bk-1")).toHaveAttr("aria-checked", "true"),
      sceneExpect(text("Select all")).toExist(),
    )
  })
})
