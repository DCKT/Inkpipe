import { Option } from "effect"
import { AsyncData } from "foldkit"
import { Command, given, message, model, story } from "foldkit/story"
import { UrlRequest } from "foldkit/navigation"
import { fromString } from "foldkit/url"
import { describe, expect, test } from "vitest"

import { Dialog, Toast as UiToast } from "@foldkit/ui"

import * as Prowlarr from "./prowlarr"
import * as Results from "./results"
import * as Settings from "./settings"
import * as Sidebar from "./sidebar"
import { defaultConfig } from "./settingsFixtures"
import * as WatchDetail from "./watchDetail"
import { wid } from "./watchFixtures"
import { toast } from "./toast"
import { modelAt } from "./testing"
import {
  AppRoute,
  LoadExternal,
  Message,
  NavigateInternal,
  init,
  subscriptions,
  update,
} from "./main"

const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(fromString(raw), () => new Error(`Failed to parse url: ${raw}`))

const onProwlarr = modelAt(AppRoute.Prowlarr())

describe("update", () => {
  test("ChangedUrl updates the route", () => {
    story(
      update,
      given(onProwlarr),
      message(Message.ChangedUrl({ url: urlOrThrow("http://localhost/watches/3") })),
      // The watch page starts loading as soon as it's entered.
      Command.resolve(
        WatchDetail.FetchWatch,
        WatchDetail.Message.FailedFetchWatch({ watchId: wid(3), seq: 1, reason: "unused" }),
      ),
      Command.resolve(
        WatchDetail.FetchAlerts,
        WatchDetail.Message.FailedFetchAlerts({ watchId: wid(3), seq: 1, reason: "unused" }),
      ),
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
      Command.resolve(
        Settings.FetchSettings,
        Settings.Message.FailedFetchSettings({ reason: "offline" }),
      ),
      model((m) => {
        expect(m.sidebar.mobileNav.isOpen).toBe(false)
        expect(m.route).toStrictEqual(AppRoute.Settings({ komgaNotConfigured: Option.none() }))
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

describe("settings page integration", () => {
  const onSettings = modelAt(AppRoute.Settings({ komgaNotConfigured: Option.none() }))

  test("entering /settings loads the page, and leaving then re-entering reloads it", () => {
    story(
      update,
      given(onProwlarr),
      message(
        Message.ChangedUrl({
          url: urlOrThrow("http://localhost/settings?komgaNotConfigured=true"),
        }),
      ),
      Command.resolve(
        Settings.FetchSettings,
        Settings.Message.FailedFetchSettings({ reason: "offline" }),
      ),
      model((m) => {
        expect(m.settings.isKomgaNotConfigured).toBe(true)
        expect(AsyncData.isFailure(m.settings.form)).toBe(true)
      }),
      message(Message.ChangedUrl({ url: urlOrThrow("http://localhost/nope") })),
      message(Message.ChangedUrl({ url: urlOrThrow("http://localhost/settings") })),
      Command.resolve(
        Settings.FetchSettings,
        Settings.Message.FailedFetchSettings({ reason: "again" }),
      ),
      model((m) => {
        expect(m.settings.isKomgaNotConfigured).toBe(false)
        expect(AsyncData.isFailure(m.settings.form)).toBe(true)
      }),
    )
  })

  test("a cold load straight onto /settings fetches immediately and keeps the banner flag", () => {
    const cold = init(urlOrThrow("http://localhost/settings?komgaNotConfigured=true"))
    expect(cold.model.settings.isKomgaNotConfigured).toBe(true)
    expect(AsyncData.isLoading(cold.model.settings.form)).toBe(true)
    expect(cold.commands?.map((c) => c.name)).toContain("FetchSettings")
  })

  test("navigating to the search page from elsewhere loads Komga series and focuses the box", () => {
    story(
      update,
      given(onSettings),
      message(Message.ChangedUrl({ url: urlOrThrow("http://localhost/") })),
      Command.resolve(Prowlarr.FocusSearch, Prowlarr.Message.CompletedFocusSearch()),
      Command.resolve(
        Results.FetchSeries,
        Results.Message.FailedFetchSeries({ reason: "no komga" }),
      ),
      model((m) => {
        expect(m.route).toStrictEqual(AppRoute.Prowlarr())
      }),
    )
  })

  test("a cold load straight onto /latest fetches the releases", () => {
    const cold = init(urlOrThrow("http://localhost/latest"))
    expect(cold.model.latest.load._tag).toBe("Loading")
    expect(cold.commands?.map((c) => c.name)).toContain("FetchLatest")
    expect(init(urlOrThrow("http://localhost/watches")).commands?.map((c) => c.name)).not.toContain(
      "FetchLatest",
    )
  })

  test("navigating to /latest loads it once, and staying on it does not reload", () => {
    const entered = update(
      onProwlarr,
      Message.ChangedUrl({ url: urlOrThrow("http://localhost/latest") }),
    )
    expect(entered.commands?.map((c) => c.name)).toContain("FetchLatest")
    expect(
      update(
        entered.model,
        Message.ChangedUrl({ url: urlOrThrow("http://localhost/latest") }),
      ).commands?.map((c) => c.name) ?? [],
    ).not.toContain("FetchLatest")
  })

  test("a cold load elsewhere does not fetch settings", () => {
    const cold = init(urlOrThrow("http://localhost/watches"))
    expect(cold.commands?.map((c) => c.name)).not.toContain("FetchSettings")
  })

  test("staying on /settings does not reload the page", () => {
    const result = update(
      onSettings,
      Message.ChangedUrl({ url: urlOrThrow("http://localhost/settings") }),
    )
    expect(result.commands ?? []).toHaveLength(0)
  })

  test("saving shows a toast and refreshes the sidebar's Copyparty link", () => {
    story(
      update,
      given(onSettings),
      message(
        Message.GotSettingsMessage({
          message: Settings.Message.SucceededSaveSettings({ config: defaultConfig }),
        }),
      ),
      Command.expectHas(Sidebar.FetchCopypartyUrl()),
      Command.resolve(
        Sidebar.FetchCopypartyUrl,
        Sidebar.Message.CompletedFetchCopypartyUrl({ maybeUrl: Option.none() }),
      ),
      model((m) => {
        expect(m.toasts.entries.map((e) => e.payload.title)).toStrictEqual([
          "Settings saved successfully.",
        ])
      }),
      UiToast.test.drainEntry({ entryId: "toasts-entry-0" }),
    )
  })

  test("importing shows a toast, reloads the form and refreshes the sidebar", () => {
    const result = update(
      onSettings,
      Message.GotSettingsMessage({ message: Settings.Message.SucceededImportSettings() }),
    )
    expect(result.model.toasts.entries.map((e) => e.payload.title)).toStrictEqual([
      "Settings imported successfully.",
    ])
    expect(result.commands?.map((c) => c.name).sort()).toStrictEqual(
      ["FetchCopypartyUrl", "FetchSettings", "WaitBeforeDismissal", "WaitForPaint"].sort(),
    )
  })

  test("a failed save toasts the error and leaves the sidebar alone", () => {
    const result = update(
      onSettings,
      Message.GotSettingsMessage({
        message: Settings.Message.FailedSaveSettings({ reason: "disk full" }),
      }),
    )
    expect(result.model.toasts.entries[0]?.variant).toBe("Error")
    expect(result.commands?.map((c) => c.name)).not.toContain("FetchCopypartyUrl")
  })
})
