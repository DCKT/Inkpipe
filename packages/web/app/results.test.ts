import { Option } from "effect"
import { describe, expect, test } from "vitest"

import {
  computeMatches,
  formatRelativeTime,
  formatSize,
  isAllSelected,
  matchLabel,
  saveLabel,
  selectedItems,
  setItems,
  init,
  SaveState,
} from "./results"
import { makeResult, makeSeries } from "./resultsFixtures"

describe("formatSize", () => {
  test.each([
    [0, "0 B"],
    [-5, "0 B"],
    [1, "1.0 B"],
    [1023, "1023.0 B"],
    [1024, "1.0 KB"],
    [1536, "1.5 KB"],
    [52_428_800, "50.0 MB"],
    [5 * 1024 ** 3, "5.0 GB"],
    [5 * 1024 ** 4, "5120.0 GB"],
  ])("%d -> %s", (bytes, text) => {
    expect(formatSize(bytes)).toBe(text)
  })
})

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-06-15T12:00:00.000Z")
  const ago = (ms: number) => new Date(now - ms).toISOString()
  const SECOND = 1000
  const MINUTE = 60 * SECOND
  const HOUR = 60 * MINUTE
  const DAY = 24 * HOUR

  test.each([
    [10 * SECOND, "just now"],
    [59 * SECOND, "just now"],
    [60 * SECOND, "1m ago"],
    [59 * MINUTE, "59m ago"],
    [HOUR, "1h ago"],
    [23 * HOUR, "23h ago"],
    [DAY, "1d ago"],
    [6 * DAY, "6d ago"],
    [7 * DAY, "1w ago"],
    [34 * DAY, "4w ago"],
    [35 * DAY, "1mo ago"],
    [359 * DAY, "11mo ago"],
    [360 * DAY, "1y ago"],
    [364 * DAY, "1y ago"],
    [365 * DAY, "1y ago"],
    [800 * DAY, "2y ago"],
  ])("%d ms ago -> %s", (elapsed, text) => {
    expect(Option.map(formatRelativeTime(now, ago(elapsed)), (t) => t.relative)).toStrictEqual(
      Option.some(text),
    )
  })

  test("gives a full date for the tooltip", () => {
    const result = formatRelativeTime(now, ago(DAY))
    expect(Option.isSome(result) && result.value.full.length > 0).toBe(true)
  })

  test("a missing or garbage date shows nothing", () => {
    expect(formatRelativeTime(now, null)).toStrictEqual(Option.none())
    expect(formatRelativeTime(now, "not a date")).toStrictEqual(Option.none())
  })

  test("a date in the future is 'just now', not negative", () => {
    expect(Option.map(formatRelativeTime(now, ago(-5 * MINUTE)), (t) => t.relative)).toStrictEqual(
      Option.some("just now"),
    )
  })
})

describe("computeMatches", () => {
  const berserk = makeResult({ guid: "a", title: "Berserk v05 [Group]" })
  const unrelated = makeResult({ guid: "b", title: "Completely Different Series v01" })

  test("is empty until series are known", () => {
    expect(computeMatches([berserk], [])).toStrictEqual({})
  })

  test("maps guids to their best series, skipping items with no good match", () => {
    const matches = computeMatches([berserk, unrelated], [makeSeries()])
    expect(Object.keys(matches)).toStrictEqual(["a"])
    expect(matches["a"]?.seriesId).toBe("s1")
  })
})

describe("labels", () => {
  test("matchLabel pluralises books", () => {
    const base = { seriesId: "s", seriesName: "Berserk", score: 0.9, booksCount: 41 }
    expect(matchLabel(base)).toBe("In Komga · Berserk · 41 books")
    expect(matchLabel({ ...base, booksCount: 1 })).toBe("In Komga · Berserk · 1 book")
  })

  test("saveLabel covers every state", () => {
    expect(saveLabel(Option.none())).toBe("Save to AllDebrid")
    expect(saveLabel(Option.some(SaveState.Saving()))).toBe("Saving to AllDebrid…")
    expect(saveLabel(Option.some(SaveState.Saved()))).toBe("Saved to AllDebrid")
    expect(saveLabel(Option.some(SaveState.Failed({ reason: "no key" })))).toBe("no key")
    expect(saveLabel(Option.some(SaveState.Failed({ reason: "" })))).toBe(
      "Failed to save to AllDebrid",
    )
  })
})

describe("selection helpers", () => {
  const a = makeResult({ guid: "a" })
  const b = makeResult({ guid: "b" })

  test("selectedItems follows the list's order, not the click order", () => {
    const model = { ...setItems(init(), [a, b], 0), selected: ["b", "a"] }
    expect(selectedItems(model).map((i) => i.guid)).toStrictEqual(["a", "b"])
  })

  test("isAllSelected is false for an empty list", () => {
    expect(isAllSelected(init())).toBe(false)
  })
})
