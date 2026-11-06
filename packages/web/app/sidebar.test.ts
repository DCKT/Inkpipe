import { describe, expect, test } from "vitest"

import { clampCount, isSubLinkActive } from "./sidebar"

describe("isSubLinkActive", () => {
  const prowlarr = { label: "Prowlarr", path: "/", end: true } as const
  const watches = { label: "Watches", path: "/watches" } as const

  test("an `end` link only matches its exact path", () => {
    expect(isSubLinkActive("/", prowlarr)).toBe(true)
    expect(isSubLinkActive("/watches", prowlarr)).toBe(false)
  })

  test("an `end` link below the root still excludes nested paths", () => {
    const docs = { label: "Docs", path: "/docs", end: true } as const
    expect(isSubLinkActive("/docs", docs)).toBe(true)
    expect(isSubLinkActive("/docs/intro", docs)).toBe(false)
  })

  test("a normal link matches nested paths but not prefix lookalikes", () => {
    expect(isSubLinkActive("/watches/3", watches)).toBe(true)
    expect(isSubLinkActive("/watches", watches)).toBe(true)
    expect(isSubLinkActive("/watchesX", watches)).toBe(false)
  })
})

describe("clampCount", () => {
  test.each([
    [3, 3],
    [3.9, 3],
    [-2, 0],
    [0, 0],
    [1e20, Number.MAX_SAFE_INTEGER],
  ])("%d -> %d", (input, expected) => {
    expect(clampCount(input)).toBe(expected)
    expect(Number.isSafeInteger(clampCount(input))).toBe(true)
  })
})
