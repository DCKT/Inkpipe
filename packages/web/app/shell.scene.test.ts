import { Option } from "effect"
import { Dialog } from "@foldkit/ui"
import {
  Command,
  Mount,
  click,
  expect as sceneExpect,
  given,
  role,
  scene,
  selector,
} from "foldkit/scene"
import { describe, test } from "vitest"

import { AppRoute, update, view } from "./main"
import { modelAt } from "./testing"

const withSidebar = (patch: { unreadCount?: number; copyparty?: string }) => {
  const base = modelAt(AppRoute.Prowlarr())
  return {
    ...base,
    sidebar: {
      ...base.sidebar,
      unreadCount: patch.unreadCount ?? base.sidebar.unreadCount,
      maybeCopypartyUrl:
        patch.copyparty === undefined
          ? base.sidebar.maybeCopypartyUrl
          : Option.some(patch.copyparty),
    },
  }
}

describe("sidebar", () => {
  test("no unread badge when there is nothing unread", () => {
    scene(
      { update, view },
      given(withSidebar({ unreadCount: 0 })),
      sceneExpect(selector("[data-unread-badge]")).toBeAbsent(),
    )
  })

  test("unread count shows on the Watches link", () => {
    scene(
      { update, view },
      given(withSidebar({ unreadCount: 5 })),
      sceneExpect(role("link", { name: /Watches/ })).toContainText("5"),
      sceneExpect(selector("[data-unread-badge]")).toHaveText("5"),
      sceneExpect(role("link", { name: /5 unread/ })).toExist(),
    )
  })

  test("unread count above 99 is capped", () => {
    scene(
      { update, view },
      given(withSidebar({ unreadCount: 250 })),
      sceneExpect(role("link", { name: /Watches/ })).toContainText("99+"),
    )
  })

  test("no Copyparty link until one is configured", () => {
    scene(
      { update, view },
      given(modelAt(AppRoute.Prowlarr())),
      sceneExpect(role("link", { name: "Copyparty" })).toBeAbsent(),
    )
  })

  test("the Copyparty link opens the configured instance in a new tab", () => {
    scene(
      { update, view },
      given(withSidebar({ copyparty: "http://copy.party" })),
      sceneExpect(role("link", { name: "Copyparty" })).toHaveAttr("href", "http://copy.party"),
      sceneExpect(role("link", { name: "Copyparty" })).toHaveAttr("target", "_blank"),
      sceneExpect(role("link", { name: "Copyparty" })).toHaveAttr("rel", "noopener noreferrer"),
    )
  })
})

describe("mobile navigation", () => {
  test("the top bar offers a collapsed menu button", () => {
    scene(
      { update, view },
      given(modelAt(AppRoute.Prowlarr())),
      sceneExpect(role("button", { name: "Open navigation" })).toHaveAttr("aria-expanded", "false"),
    )
  })

  test("clicking the menu button opens the drawer", () => {
    scene(
      { update, view },
      given(modelAt(AppRoute.Prowlarr())),
      sceneExpect(selector("dialog nav")).toBeAbsent(),
      click(role("button", { name: "Open navigation" })),
      Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      sceneExpect(role("button", { name: "Open navigation" })).toHaveAttr("aria-expanded", "true"),
      sceneExpect(selector("dialog nav")).toExist(),
      sceneExpect(role("dialog", { name: "Navigation" })).toExist(),
    )
  })
})
