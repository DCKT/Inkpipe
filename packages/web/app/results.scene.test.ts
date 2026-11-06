import type { Html, HtmlBuilder } from "foldkit/html"
import {
  Command,
  all,
  click,
  expectAll,
  expect as sceneExpect,
  given,
  scene,
  selector,
  text,
} from "foldkit/scene"
import { describe, test } from "vitest"

import * as Results from "./results"
import { makeResult, makeSeries } from "./resultsFixtures"

const harness = {
  update: (model: Results.Model, message: Results.Message) => Results.update(model, message),
  view: (model: Results.Model, h: HtmlBuilder<Results.Message>): Html =>
    h.submodel({
      slotId: "results",
      model,
      view: Results.view,
      viewInputs: { idPrefix: "rs" },
      toParentMessage: (message) => message,
    }),
}

const a = makeResult({ guid: "a", title: "Berserk v05 [Group]", publishDate: null })
const b = makeResult({
  guid: "b",
  title: "Vagabond v03",
  size: 1024,
  seeders: 3,
  indexer: "Sukebei",
})

const start = (items = [a, b], nowMillis = Date.parse("2026-06-15T12:00:00.000Z")) =>
  Results.setItems(Results.init(), items, nowMillis)

// The Komga series fetch is pending in every fresh model.
const settled = (model: Results.Model) =>
  Results.update(model, Results.Message.FailedFetchSeries({ reason: "no komga" })).model

describe("rendering", () => {
  test("nothing is rendered for an empty list (the page owns the empty state)", () => {
    scene(harness, given(start([])), sceneExpect(selector("table")).toBeAbsent())
  })

  test("renders both layouts, with every row titled", () => {
    scene(
      harness,
      given(start()),
      expectAll(all.selector("table tbody tr")).toHaveCount(2),
      sceneExpect(selector("#rs-card-0")).toExist(),
      sceneExpect(selector("#rs-row-1")).toExist(),
      sceneExpect(text("Vagabond v03")).toExist(),
    )
  })

  test("shows size, seeders, indexer and a dash for a missing date", () => {
    scene(
      harness,
      given(start()),
      sceneExpect(text("1.0 KB")).toExist(),
      sceneExpect(text("Sukebei")).toExist(),
      sceneExpect(text("—")).toExist(),
      sceneExpect(text("3 seeders")).toExist(),
    )
  })

  test("shows relative dates", () => {
    scene(
      harness,
      given(start([makeResult({ guid: "x", publishDate: "2026-06-12T12:00:00.000Z" })])),
      sceneExpect(text("3d ago")).toExist(),
    )
  })
})

describe("Komga badge", () => {
  test("appears on rows that match a series", () => {
    const model = Results.update(
      start(),
      Results.Message.SucceededFetchSeries({ series: [makeSeries()] }),
    ).model
    scene(
      harness,
      given(model),
      sceneExpect(text("In Komga · Berserk · 41 books")).toExist(),
      expectAll(all.selector(".status-pill")).toHaveCount(2),
    )
  })

  test("is absent when nothing matches", () => {
    scene(harness, given(settled(start())), sceneExpect(selector(".status-pill")).toBeAbsent())
  })
})

describe("selection", () => {
  test("a row's checkbox reflects and toggles its selection", () => {
    scene(
      harness,
      given(settled(start())),
      sceneExpect(selector("#rs-row-0")).toHaveAttr("aria-checked", "false"),
      click(selector("#rs-row-0")),
      sceneExpect(selector("#rs-row-0")).toHaveAttr("aria-checked", "true"),
      sceneExpect(selector("#rs-card-0")).toHaveAttr("aria-checked", "true"),
      sceneExpect(selector("#rs-row-1")).toHaveAttr("aria-checked", "false"),
    )
  })

  test("select all checks every row and shows a mixed state when partial", () => {
    scene(
      harness,
      given(settled(start())),
      click(selector("#rs-row-0")),
      sceneExpect(selector("#rs-row-all")).toHaveAttr("aria-checked", "mixed"),
      click(selector("#rs-row-all")),
      sceneExpect(selector("#rs-row-1")).toHaveAttr("aria-checked", "true"),
      sceneExpect(selector("#rs-row-all")).toHaveAttr("aria-checked", "true"),
    )
  })

  test("a row's checkbox is labelled by its title, so it has an accessible name", () => {
    scene(
      harness,
      given(settled(start())),
      sceneExpect(selector("#rs-row-1")).toHaveAttr("aria-labelledby", "rs-row-1-label"),
      sceneExpect(selector("#rs-row-1-label")).toContainText("Vagabond v03"),
    )
  })

  test("clicking a row's title toggles it too", () => {
    scene(
      harness,
      given(settled(start())),
      click(selector("#rs-row-1-label")),
      sceneExpect(selector("#rs-row-1")).toHaveAttr("aria-checked", "true"),
    )
  })

  test("both select-all checkboxes have a name (visible on cards, hidden on the table)", () => {
    scene(
      harness,
      given(settled(start())),
      sceneExpect(selector("#rs-card-all-label")).toHaveText("Select all"),
      sceneExpect(selector("#rs-row-all-label")).toHaveText("Select all"),
      sceneExpect(selector("#rs-row-all-label")).toHaveClass("sr-only"),
    )
  })
})

describe("save to AllDebrid", () => {
  test("shows progress then success on the clicked row only", () => {
    scene(
      harness,
      given(settled(start())),
      click(selector("[data-save='a']")),
      sceneExpect(selector("[data-save='a']")).toBeDisabled(),
      sceneExpect(selector("[data-save='a']")).toHaveAttr("title", "Saving to AllDebrid…"),
      sceneExpect(selector("[data-save='b']")).toBeEnabled(),
      Command.resolve(
        Results.SaveMagnet,
        Results.Message.SucceededSaveMagnet({ guid: "a", listVersion: 1 }),
      ),
      sceneExpect(selector("[data-save='a']")).toHaveAttr("title", "Saved to AllDebrid"),
    )
  })

  test("a failure shows the server's reason", () => {
    scene(
      harness,
      given(settled(start())),
      click(selector("[data-save='b']")),
      Command.resolve(
        Results.SaveMagnet,
        Results.Message.FailedSaveMagnet({
          guid: "b",
          listVersion: 1,
          reason: "AllDebrid key missing",
        }),
      ),
      sceneExpect(selector("[data-save='b']")).toHaveAttr("title", "AllDebrid key missing"),
      sceneExpect(selector("[data-save='b']")).toBeEnabled(),
    )
  })
})

describe("layouts", () => {
  test("cards show below sm and the table from sm up", () => {
    scene(
      harness,
      given(settled(start())),
      sceneExpect(selector("[data-layout='cards']")).toHaveClass("sm:hidden"),
      sceneExpect(selector("[data-layout='cards']")).not.toHaveClass("hidden"),
      sceneExpect(selector("[data-layout='table']")).toHaveClass("hidden"),
      sceneExpect(selector("[data-layout='table']")).toHaveClass("sm:block"),
    )
  })

  test("the card layout carries date, size, seeders and indexer", () => {
    scene(
      harness,
      given(settled(start())),
      sceneExpect(selector("[data-layout='cards'] [data-guid='b'] [data-col='date']")).toExist(),
      sceneExpect(selector("[data-layout='cards'] [data-guid='b'] [data-col='size']")).toHaveText(
        "1.0 KB",
      ),
      sceneExpect(
        selector("[data-layout='cards'] [data-guid='b'] [data-col='seeders']"),
      ).toHaveText("3 seeders"),
      sceneExpect(
        selector("[data-layout='cards'] [data-guid='b'] [data-col='indexer']"),
      ).toHaveText("Sukebei"),
    )
  })

  test("the table has a column for each of date, size, seeders and indexer, with scoped headers", () => {
    scene(
      harness,
      given(settled(start())),
      sceneExpect(selector("[data-layout='table'] [data-guid='b'] [data-col='size']")).toHaveText(
        "1.0 KB",
      ),
      sceneExpect(
        selector("[data-layout='table'] [data-guid='b'] [data-col='seeders']"),
      ).toHaveText("3"),
      sceneExpect(
        selector("[data-layout='table'] [data-guid='b'] [data-col='indexer']"),
      ).toHaveText("Sukebei"),
      sceneExpect(selector("[data-layout='table'] [data-guid='a'] [data-col='date']")).toHaveText(
        "—",
      ),
      sceneExpect(selector("th[scope='col']")).toExist(),
    )
  })

  test("dates carry their full form as a tooltip", () => {
    scene(
      harness,
      given(settled(start([makeResult({ guid: "x", publishDate: "2026-06-12T12:00:00.000Z" })]))),
      sceneExpect(selector("[data-layout='table'] [data-col='date'] span[title]")).toExist(),
    )
  })

  test("a selected card is highlighted", () => {
    scene(
      harness,
      given(settled(start())),
      sceneExpect(selector("[data-layout='cards'] [data-guid='a']")).not.toHaveClass(
        "bg-accent-tint",
      ),
      click(selector("#rs-card-0-label")),
      sceneExpect(selector("[data-layout='cards'] [data-guid='a']")).toHaveClass("bg-accent-tint"),
    )
  })

  test("a Komga badge explains its score on hover", () => {
    const model = Results.update(
      start(),
      Results.Message.SucceededFetchSeries({ series: [makeSeries()] }),
    ).model
    scene(
      harness,
      given(model),
      sceneExpect(selector(".status-pill[title^='Komga match score: ']")).toExist(),
    )
  })
})

describe("accessibility", () => {
  test("the checkbox's name is the title alone, not the details", () => {
    scene(
      harness,
      given(settled(start())),
      sceneExpect(selector("#rs-row-1-label")).toHaveText("Vagabond v03"),
    )
  })

  test("the save button names its row", () => {
    scene(
      harness,
      given(settled(start())),
      sceneExpect(selector("[data-save='b']")).toHaveAttr(
        "aria-label",
        "Save to AllDebrid: Vagabond v03",
      ),
    )
  })

  test("the half-selected state is drawn, not just announced", () => {
    scene(
      harness,
      given(settled(start())),
      click(selector("#rs-row-0")),
      sceneExpect(selector("#rs-row-all")).toHaveClass("aria-[checked=mixed]:bg-accent"),
    )
  })
})

describe("hostile guids", () => {
  test.each(["constructor", "toString", "__proto__"])(
    "a release with guid %j renders and works",
    (guid) => {
      scene(
        harness,
        given(settled(start([makeResult({ guid, title: "Odd one" })]))),
        sceneExpect(text("Odd one")).toExist(),
        sceneExpect(selector(".status-pill")).toBeAbsent(),
        click(selector("#rs-row-0")),
        sceneExpect(selector("#rs-row-0")).toHaveAttr("aria-checked", "true"),
        click(selector(`[data-save='${guid}']`)),
        sceneExpect(selector(`[data-save='${guid}']`)).toBeDisabled(),
        Command.resolve(
          Results.SaveMagnet,
          Results.Message.FailedSaveMagnet({ guid, listVersion: 1, reason: "x" }),
        ),
      )
    },
  )
})
