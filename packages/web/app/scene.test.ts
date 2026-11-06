import { Command, click, expect as sceneExpect, given, role, scene, selector } from "foldkit/scene"
import { Animation } from "@foldkit/ui"
import { describe, expect, test } from "vitest"

import { AppRoute, Message, Model, isSubLinkActive, update, view } from "./main"
import { initialToasts, toast } from "./toast"

const at = (route: AppRoute) => Model.make({ route, toasts: initialToasts() })

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

describe("toasts", () => {
  const withToast = (request: ReturnType<typeof toast.success>) =>
    update(at(AppRoute.Prowlarr()), Message.RequestedToast({ request })).model

  test("the toast region is always present for screen readers", () => {
    scene(
      { update, view },
      given(at(AppRoute.Prowlarr())),
      sceneExpect(role("region", { name: "Notifications" })).toExist(),
    )
  })

  test("a requested toast renders its title, description and a dismiss button", () => {
    scene(
      { update, view },
      given(withToast(toast.error("Failed to clear jobs", "boom"))),
      sceneExpect(role("alert")).toContainText("Failed to clear jobs"),
      sceneExpect(role("alert")).toContainText("boom"),
      sceneExpect(role("button", { name: "Dismiss notification" })).toExist(),
    )
  })

  test("success toasts are announced politely (status), errors assertively (alert)", () => {
    scene(
      { update, view },
      given(withToast(toast.success("Saved"))),
      sceneExpect(role("status")).toContainText("Saved"),
      sceneExpect(role("alert")).toBeAbsent(),
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

describe("toast dismissal", () => {
  test("clicking the dismiss button starts the entry's leave animation", () => {
    const shown = update(
      at(AppRoute.Prowlarr()),
      Message.RequestedToast({ request: toast.success("Saved") }),
    ).model

    scene(
      { update, view },
      given(shown),
      click(role("button", { name: "Dismiss notification" })),
      sceneExpect(role("status")).toHaveAttr("data-leave", ""),
      Command.resolveAll(
        [
          Animation.WaitForPaint({ generation: 2 }),
          Animation.Message.CompletedWaitForPaint({ generation: 2 }),
        ],
        [
          Animation.WaitForAnimationSettled({ id: "toasts-entry-0", generation: 2 }),
          Animation.Message.EndedAnimation({ generation: 2 }),
        ],
      ),
      sceneExpect(role("status")).toBeAbsent(),
    )
  })
})
