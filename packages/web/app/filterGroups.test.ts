import type { FilterGroup } from "@inkpipe/shared"
import { describe, expect, test } from "vitest"

import {
  addGroup,
  addSubstring,
  cleanGroups,
  removeGroup,
  removeSubstring,
  setMode,
  setSubstring,
} from "./filterGroups"

const a: FilterGroup = { mode: "AND", substrings: ["one", "piece"] }
const b: FilterGroup = { mode: "OR", substrings: ["color", "digital"] }

describe("group edits", () => {
  test("addGroup appends an empty AND group with one blank substring", () => {
    expect(addGroup([a])).toStrictEqual([a, { mode: "AND", substrings: [""] }])
    expect(addGroup([])).toStrictEqual([{ mode: "AND", substrings: [""] }])
  })

  test("addGroup does not mutate or share state with earlier groups", () => {
    const first = addGroup([])
    const second = addGroup(first)
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(2)
  })

  test("removeGroup drops only that index", () => {
    expect(removeGroup([a, b], 0)).toStrictEqual([b])
    expect(removeGroup([a, b], 1)).toStrictEqual([a])
    expect(removeGroup([a, b], 5)).toStrictEqual([a, b])
  })

  test("setMode changes only that group's mode", () => {
    expect(setMode([a, b], 0, "OR")).toStrictEqual([{ ...a, mode: "OR" }, b])
    expect(setMode([a, b], 1, "AND")).toStrictEqual([a, { ...b, mode: "AND" }])
  })

  test("setSubstring changes only that substring", () => {
    expect(setSubstring([a, b], 1, 0, "COLOUR")).toStrictEqual([
      a,
      { ...b, substrings: ["COLOUR", "digital"] },
    ])
    expect(setSubstring([a, b], 0, 1, "x")).toStrictEqual([{ ...a, substrings: ["one", "x"] }, b])
  })

  test("addSubstring appends a blank to that group only", () => {
    expect(addSubstring([a, b], 0)).toStrictEqual([{ ...a, substrings: ["one", "piece", ""] }, b])
  })

  test("removeSubstring removes that one only", () => {
    expect(removeSubstring([a, b], 0, 0)).toStrictEqual([{ ...a, substrings: ["piece"] }, b])
    expect(removeSubstring([a, b], 1, 1)).toStrictEqual([a, { ...b, substrings: ["color"] }])
  })

  test("edits with an out-of-range index leave everything as it was", () => {
    expect(setMode([a], 3, "OR")).toStrictEqual([a])
    expect(setSubstring([a], 3, 0, "x")).toStrictEqual([a])
    expect(addSubstring([a], 3)).toStrictEqual([a])
  })
})

describe("cleanGroups", () => {
  test("drops blank and whitespace-only substrings, then empty groups", () => {
    expect(
      cleanGroups([
        { mode: "AND", substrings: ["one", "  ", ""] },
        { mode: "OR", substrings: ["", " "] },
        b,
      ]),
    ).toStrictEqual([{ mode: "AND", substrings: ["one"] }, b])
  })

  test("keeps the mode and the order, and leaves a clean list unchanged", () => {
    expect(cleanGroups([b, a])).toStrictEqual([b, a])
    expect(cleanGroups([])).toStrictEqual([])
  })

  test("does not trim the substrings it keeps (matching is the server's business)", () => {
    expect(cleanGroups([{ mode: "AND", substrings: [" a "] }])).toStrictEqual([
      { mode: "AND", substrings: [" a "] },
    ])
  })
})
