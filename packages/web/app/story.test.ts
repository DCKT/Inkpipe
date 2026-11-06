import { Option } from "effect"
import { Command, given, message, model, story } from "foldkit/story"
import { UrlRequest } from "foldkit/navigation"
import { fromString } from "foldkit/url"
import { describe, expect, test } from "vitest"

import { AppRoute, LoadExternal, Message, Model, NavigateInternal, update } from "./main"

const urlOrThrow = (raw: string) =>
  Option.getOrThrowWith(fromString(raw), () => new Error(`Failed to parse url: ${raw}`))

const onProwlarr = Model.make({ route: AppRoute.Prowlarr() })

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
