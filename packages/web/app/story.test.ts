import { Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { UrlRequest } from "foldkit/navigation"
import { fromString } from "foldkit/url"
import { describe, expect, test } from "vitest"

import { Dialog, Toast as UiToast } from "@foldkit/ui"

import * as Sidebar from "./sidebar"
import { toast } from "./toast"
import { modelAt } from "./testing"
import { AppRoute, LoadExternal, Message, NavigateInternal, subscriptions, update } from "./main"

const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(fromString(raw), () => new Error(`Failed to parse url: ${raw}`))

const onProwlarr = modelAt(AppRoute.Prowlarr())

describe("update", () => {
  test("ChangedUrl updates the route", () => {
    story(
      update,
      given(onProwlarr),
      message(Message.ChangedUrl({ url: urlOrThrow("http://localhost/watches/3") })),
      model((m) => {
        expect(m.route).toStrictEqual(AppRoute.WatchDetail({ watchId: 3 }))
      }),
    )
  })

  test("ChangedUrl to an unknown path yields NotFound", () => {
    story(
      update,
      given(onProwlarr),
      message(Message.ChangedUrl({ url: urlOrThrow("http://localhost/nope") })),
      model((m) => {
        expect(m.route).toStrictEqual(AppRoute.NotFound({ path: "/nope" }))
      }),
    )
  })

  test("clicking an internal link pushes the URL without changing the route", () => {
    story(
      update,
      given(onProwlarr),
      message(
        Message.ClickedLink({
          request: UrlRequest.Internal({ url: urlOrThrow("http://localhost/settings") }),
        }),
      ),
      Command.expectHas(NavigateInternal({ url: "http://localhost/settings" })),
      Command.resolve(NavigateInternal, Message.CompletedNavigateInternal()),
      model((m) => {
        expect(m.route).toStrictEqual(AppRoute.Prowlarr())
      }),
    )
  })

  test("clicking an external link loads it", () => {
    story(
      update,
      given(onProwlarr),
      message(
        Message.ClickedLink({ request: UrlRequest.External({ href: "https://example.com" }) }),
      ),
      Command.expectHas(LoadExternal({ href: "https://example.com" })),
      Command.resolve(LoadExternal, Message.CompletedLoadExternal()),
      model((m) => {
        expect(m.route).toStrictEqual(AppRoute.Prowlarr())
      }),
    )
  })
})

describe("toasts", () => {
  test("RequestedToast adds one entry with the requested variant and payload", () => {
    story(
      update,
      given(onProwlarr),
      message(Message.RequestedToast({ request: toast.error("Failed to clear jobs", "boom") })),
      model((m) => {
        expect(m.toasts.entries).toHaveLength(1)
        expect(m.toasts.entries[0]?.variant).toBe("Error")
        expect(m.toasts.entries[0]?.payload).toStrictEqual({
          title: "Failed to clear jobs",
          maybeDescription: Option.some("boom"),
        })
      }),
      UiToast.test.drainEntry({ entryId: "toasts-entry-0" }),
      model((m) => {
        expect(m.toasts.entries).toHaveLength(0)
      }),
    )
  })

  test("a second request gets its own entry once the first is gone", () => {
    story(
      update,
      given(onProwlarr),
      message(Message.RequestedToast({ request: toast.success("One") })),
      UiToast.test.drainEntry({ entryId: "toasts-entry-0" }),
      message(Message.RequestedToast({ request: toast.info("Two") })),
      model((m) => {
        expect(m.toasts.entries.map((e) => [e.id, e.payload.title])).toStrictEqual([
          ["toasts-entry-1", "Two"],
        ])
      }),
      UiToast.test.drainEntry({ entryId: "toasts-entry-1" }),
    )
  })
})

describe("mobile navigation", () => {
  test("navigating closes an open drawer", () => {
    const opened = {
      ...onProwlarr,
      sidebar: Sidebar.update(onProwlarr.sidebar, Sidebar.Message.ClickedOpenMobileNav()).model,
    }
    story(
      update,
      given(opened),
      message(Message.ChangedUrl({ url: urlOrThrow("http://localhost/settings") })),
      Command.resolve(Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()),
      model((m) => {
        expect(m.sidebar.mobileNav.isOpen).toBe(false)
        expect(m.route).toStrictEqual(AppRoute.Settings())
      }),
    )
  })
})

describe("subscriptions", () => {
  test("the root registers both the toast and the sidebar subscriptions", () => {
    const keys = Object.keys(subscriptions)
    expect(keys).toContain("refreshUnreadCount")
    // jobs: socket + poll + clock must be lifted too, or live updates silently stop
    expect(keys).toEqual(expect.arrayContaining(["socket", "poll", "clock"]))
    expect(keys.length).toBeGreaterThan(1)
  })
})
