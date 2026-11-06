import { Effect, Schema } from "effect"
import { Command, type Runtime, type Update } from "foldkit"
import type { Document, Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { UrlRequest, load, pushUrl } from "foldkit/navigation"
import { modifyFields } from "foldkit/struct"
import { Url, toString as urlToString } from "foldkit/url"

import { NAV_ITEMS, SETTINGS_NAV_ITEM, type NavSubLink } from "./lib/nav"
import { AppRoute, routeTitle, routeToPath, urlToAppRoute } from "./route"

export { AppRoute } from "./route"

// MODEL

export const Model = Schema.Struct({
  route: AppRoute,
})

export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
})

export type Message = typeof Message.Type

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message> = (url) => ({
  model: { route: urlToAppRoute(url) },
})

// COMMAND

export const NavigateInternal = Command.define("NavigateInternal", {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

export const LoadExternal = Command.define("LoadExternal", {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),

    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({ model, commands: [NavigateInternal({ url: urlToString(url) })] }),
        External: ({ href }) => ({ model, commands: [LoadExternal({ href })] }),
      }),

    ChangedUrl: ({ url }) => ({ model: modifyFields(model, { route: () => urlToAppRoute(url) }) }),
  })

// VIEW

/** A sub link is active on its exact path, or (unless `end`) on any nested path. */
export const isSubLinkActive = (pathname: string, link: NavSubLink): boolean =>
  link.end === true
    ? pathname === link.path
    : pathname === link.path || pathname.startsWith(`${link.path}/`)

const cx = (...parts: ReadonlyArray<string | false>): string => parts.filter(Boolean).join(" ")

const navLink = (
  h: HtmlBuilder<Message>,
  {
    path,
    active,
    className,
    label,
    numeral,
    quiet,
  }: {
    readonly path: string
    readonly active: boolean
    readonly className?: string
    readonly label: string
    readonly numeral?: string
    readonly quiet?: boolean
  },
): Html =>
  h.a(
    [
      h.Href(path),
      h.Title(label),
      h.Class(
        cx("spine-link", className ?? false, active && (quiet ? "is-active-quiet" : "is-active")),
      ),
      ...(active ? [h.AriaCurrent("page")] : []),
    ],
    [
      ...(numeral === undefined
        ? []
        : [
            h.span(
              [h.Class(cx("spine-numeral", quiet === true && "spine-numeral-quiet"))],
              [numeral],
            ),
          ]),
      h.span([h.Class("spine-label")], [label]),
    ],
  )

const navView = (route: AppRoute, h: HtmlBuilder<Message>): Html => {
  const pathname = routeToPath(route)

  return h.nav(
    [h.Class("flex h-full flex-col"), h.AriaLabel("Primary")],
    [
      h.div(
        [h.Class("flex flex-col gap-0.5 px-2 py-3")],
        NAV_ITEMS.flatMap((item) =>
          item.type === "link"
            ? [
                navLink(h, {
                  path: item.path,
                  active: isSubLinkActive(pathname, item),
                  label: item.label,
                  numeral: item.numeral,
                }),
              ]
            : [
                h.div(
                  [
                    h.Class(
                      cx(
                        "spine-link spine-link-section",
                        item.children.some((child) => isSubLinkActive(pathname, child)) &&
                          "is-active",
                      ),
                    ),
                  ],
                  [
                    h.span([h.Class("spine-numeral")], [item.numeral]),
                    h.span([h.Class("spine-label")], [item.label]),
                  ],
                ),
                ...item.children.map((child) =>
                  navLink(h, {
                    path: child.path,
                    active: isSubLinkActive(pathname, child),
                    className: "spine-link-sub",
                    label: child.label,
                  }),
                ),
              ],
        ),
      ),
      h.div(
        [h.Class("mt-auto border-t border-border px-2 py-3")],
        [
          navLink(h, {
            path: SETTINGS_NAV_ITEM.path,
            active: isSubLinkActive(pathname, SETTINGS_NAV_ITEM),
            className: "spine-link-quiet",
            label: SETTINGS_NAV_ITEM.label,
            numeral: SETTINGS_NAV_ITEM.numeral,
            quiet: true,
          }),
          ...(import.meta.env.DEV
            ? [
                navLink(h, {
                  path: "/debug",
                  active: pathname === "/debug",
                  className: "spine-link-dev",
                  label: "Debug",
                  quiet: true,
                }),
              ]
            : []),
        ],
      ),
    ],
  )
}

const pageView = (route: AppRoute, h: HtmlBuilder<Message>): Html =>
  h.main(
    [h.Class("page-wrap py-8")],
    [h.h1([h.Class("display-title text-2xl")], [routeTitle(route)])],
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: routeTitle(model.route),
  body: h.div(
    [h.Class("flex min-h-screen")],
    [
      h.aside(
        [h.Class("sticky top-0 h-screen w-[220px] shrink-0 border-r border-border bg-surface")],
        [navView(model.route, h)],
      ),
      h.div([h.Class("min-w-0 flex-1")], [pageView(model.route, h)]),
    ],
  ),
})
