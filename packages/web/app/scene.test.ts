import { expect as sceneExpect, given, role, scene, selector } from "foldkit/scene"
import { describe, expect, test } from "vitest"

import { AppRoute, Model, isSubLinkActive, update, view } from "./main"

const at = (route: AppRoute) => Model.make({ route })

describe("view", () => {
  test("primary nav lists every section and settings", () => {
    scene(
      { update, view },
      given(at(AppRoute.Prowlarr())),
      sceneExpect(role("link", { name: /Prowlarr/ })).toExist(),
      sceneExpect(role("link", { name: /Anna's Archive/ })).toExist(),
      sceneExpect(role("link", { name: /Komga/ })).toExist(),
      sceneExpect(role("link", { name: /Watches/ })).toExist(),
      sceneExpect(role("link", { name: /CBZ to EPUB/ })).toExist(),
      sceneExpect(role("link", { name: /Settings/ })).toExist(),
    )
  })

  test("the link for the current page is active and carries aria-current", () => {
    scene(
      { update, view },
      given(at(AppRoute.WatchDetail({ watchId: 3 }))),
      sceneExpect(role("link", { name: /Watches/ })).toHaveClass("is-active"),
      sceneExpect(role("link", { name: /Watches/ })).toHaveAttr("aria-current", "page"),
      sceneExpect(role("link", { name: /Komga/ })).not.toHaveClass("is-active"),
      sceneExpect(role("link", { name: /Komga/ })).not.toHaveAttr("aria-current"),
    )
  })

  test("Prowlarr is only active on `/`, not on its sibling Anna's Archive", () => {
    scene(
      { update, view },
      given(at(AppRoute.AnnasArchive())),
      sceneExpect(role("link", { name: /Anna's Archive/ })).toHaveClass("is-active"),
      sceneExpect(role("link", { name: /Prowlarr/ })).not.toHaveClass("is-active"),
    )
  })

  test("a section header is active when one of its children is", () => {
    scene(
      { update, view },
      given(at(AppRoute.Convert())),
      sceneExpect(selector(".spine-link-section.is-active")).toContainText("Utils"),
      sceneExpect(selector(".spine-link-section.is-active")).not.toContainText("Search"),
    )
  })

  test("settings uses the quiet active style and no other link is active", () => {
    scene(
      { update, view },
      given(at(AppRoute.Settings())),
      sceneExpect(role("link", { name: /Settings/ })).toHaveClass("is-active-quiet"),
      sceneExpect(role("link", { name: /Settings/ })).not.toHaveClass("is-active"),
      sceneExpect(selector(".spine-link.is-active")).toBeAbsent(),
    )
  })

  test("NotFound activates nothing", () => {
    scene(
      { update, view },
      given(at(AppRoute.NotFound({ path: "/nope" }))),
      sceneExpect(selector(".spine-link.is-active")).toBeAbsent(),
      sceneExpect(selector(".spine-link.is-active-quiet")).toBeAbsent(),
    )
  })

  test("the dev-only Debug link is reachable and highlights on /debug", () => {
    scene(
      { update, view },
      given(at(AppRoute.Debug())),
      sceneExpect(role("link", { name: "Debug" })).toHaveClass("is-active-quiet"),
    )
  })

  test("the page heading reflects the route", () => {
    scene(
      { update, view },
      given(at(AppRoute.Settings())),
      sceneExpect(role("heading", { name: "Settings · Inkpipe" })).toExist(),
    )
  })
})

describe("isSubLinkActive", () => {
  const prowlarr = { label: "Prowlarr", path: "/", end: true } as const
  const watches = { label: "Watches", path: "/watches" } as const

  test("an `end` link only matches its exact path", () => {
    expect(isSubLinkActive("/", prowlarr)).toBe(true)
    expect(isSubLinkActive("/watches", prowlarr)).toBe(false)
  })

  test("a normal link matches nested paths but not prefix lookalikes", () => {
    expect(isSubLinkActive("/watches/3", watches)).toBe(true)
    expect(isSubLinkActive("/watches", watches)).toBe(true)
    expect(isSubLinkActive("/watchesX", watches)).toBe(false)
  })
})
