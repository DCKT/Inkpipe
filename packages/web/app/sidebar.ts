import { Dialog } from "@foldkit/ui"
import { Duration, Effect, Option, Schema, Stream, String as Str } from "effect"
import { Command, Submodel, Subscription, Update } from "foldkit"
import type { Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, callApi } from "./api"
import * as Icon from "./icon"
import { NAV_ITEMS, SETTINGS_NAV_ITEM, type NavSubLink } from "./lib/nav"
import { type AppRoute, routeToPath } from "./route"

export const UNREAD_REFRESH_INTERVAL = Duration.seconds(30)

// MODEL

export const Model = Schema.Struct({
  mobileNav: Dialog.Model,
  /** Link to the Copyparty instance; `None` until fetched or when unconfigured. */
  maybeCopypartyUrl: Schema.Option(Schema.String),
  unreadCount: Schema.Int,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  GotMobileNavMessage: { message: Dialog.Message },
  ClickedOpenMobileNav: {},
  CompletedFetchCopypartyUrl: { maybeUrl: Schema.Option(Schema.String) },
  /** `None` when the poll failed: the badge keeps its last known value. */
  CompletedFetchUnreadCount: { maybeCount: Schema.Option(Schema.Int) },
  TickedRefreshUnreadCount: {},
})
export type Message = typeof Message.Type

/** The Model holds a safe, non-negative integer whatever the server sends. */
export const clampCount = (count: number): number =>
  Math.min(Math.max(0, Math.trunc(count)), Number.MAX_SAFE_INTEGER)

// COMMAND

// Both fetches are background chrome: a failure must not toast or crash, it
// just leaves the previous value in place (same as the old react-query hooks).
export const FetchCopypartyUrl = Command.define("FetchCopypartyUrl", {
  messages: [Message.CompletedFetchCopypartyUrl],
  execute: callApi((client) => client.settings.get()).pipe(
    Effect.match({
      onSuccess: (settings) =>
        Message.CompletedFetchCopypartyUrl({
          maybeUrl: Option.liftPredicate(Str.isNonEmpty)(settings.copyparty.url),
        }),
      onFailure: () => Message.CompletedFetchCopypartyUrl({ maybeUrl: Option.none() }),
    }),
  ),
})

export const FetchUnreadCount = Command.define("FetchUnreadCount", {
  messages: [Message.CompletedFetchUnreadCount],
  execute: callApi((client) => client.watches.unreadCount()).pipe(
    Effect.match({
      onSuccess: ({ count }) =>
        Message.CompletedFetchUnreadCount({
          maybeCount: Option.some(clampCount(count)),
        }),
      onFailure: () => Message.CompletedFetchUnreadCount({ maybeCount: Option.none() }),
    }),
  ),
})

// INIT

export const init = (): Update.Return<Model, Message, ApiClientService> => ({
  model: {
    mobileNav: Dialog.init({ id: "mobile-nav" }),
    maybeCopypartyUrl: Option.none(),
    unreadCount: 0,
  },
  commands: [FetchCopypartyUrl(), FetchUnreadCount()],
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message, ApiClientService>

const foldMobileNavOutMessage = Dialog.OutMessage.match<Update.Step<Model, Message>>({
  Opened: () => (model) => ({ model }),
  Closed: () => (model) => ({ model }),
})

const mobileNavFold = {
  read: (model: Model) => Option.some(model.mobileNav),
  write: (model: Model, mobileNav: Dialog.Model) =>
    modifyFields(model, { mobileNav: () => mobileNav }),
  toParentMessage: (message: Dialog.Message) => Message.GotMobileNavMessage({ message }),
  foldOutMessage: foldMobileNavOutMessage,
}

const foldMobileNav = Update.foldChild({ update: Dialog.update, ...mobileNavFold })
const foldMobileNavOpen = Update.foldChildStep({ update: Dialog.open, ...mobileNavFold })
const foldMobileNavClose = Update.foldChildStep({ update: Dialog.close, ...mobileNavFold })

/**
 * Entry points for parents: re-fetch after something that changes the data
 * (saving settings, acknowledging alerts). The old react-query cache was
 * invalidated by those pages; Settings/WatchDetail call these.
 */
export const refreshCopypartyUrl = (model: Model): UpdateReturn => ({
  model,
  commands: [FetchCopypartyUrl()],
})
export const refreshUnreadCount = (model: Model): UpdateReturn => ({
  model,
  commands: [FetchUnreadCount()],
})

/** Used by the parent to dismiss the drawer when the route changes. */
export const closeMobileNav = (model: Model): UpdateReturn => foldMobileNavClose(model)

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    GotMobileNavMessage: ({ message }) => foldMobileNav(model, message),
    ClickedOpenMobileNav: () => foldMobileNavOpen(model),
    CompletedFetchCopypartyUrl: ({ maybeUrl }) => ({
      model: modifyFields(model, { maybeCopypartyUrl: () => maybeUrl }),
    }),
    CompletedFetchUnreadCount: ({ maybeCount }) => ({
      model: modifyFields(model, {
        unreadCount: (current) => Option.getOrElse(maybeCount, () => current),
      }),
    }),
    TickedRefreshUnreadCount: () => ({ model, commands: [FetchUnreadCount()] }),
  })

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()(() => ({
  refreshUnreadCount: Subscription.persistentEntry(
    // `tick` emits immediately; init already fetched, so skip the first.
    Stream.tick(UNREAD_REFRESH_INTERVAL).pipe(
      Stream.drop(1),
      Stream.map(() => Message.TickedRefreshUnreadCount()),
    ),
  ),
}))

// VIEW

/** A sub link is active on its exact path, or (unless `end`) on any nested path. */
export const isSubLinkActive = (pathname: string, link: NavSubLink): boolean =>
  link.end === true
    ? pathname === link.path
    : pathname === link.path || pathname.startsWith(`${link.path}/`)

const cx = (...parts: ReadonlyArray<string | false>): string => parts.filter(Boolean).join(" ")

export const unreadBadgeText = (count: number): string => (count > 99 ? "99+" : String(count))

type ViewInputs = Readonly<{ route: AppRoute }>

const navLink = (
  h: HtmlBuilder<Message>,
  {
    path,
    active,
    className,
    label,
    numeral,
    quiet,
    trailing,
  }: {
    readonly path: string
    readonly active: boolean
    readonly className?: string
    readonly label: string
    readonly numeral?: string
    readonly quiet?: boolean
    readonly trailing?: ReadonlyArray<Html>
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
      ...(trailing ?? []),
    ],
  )

const unreadBadge = (count: number, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  count === 0
    ? []
    : [
        h.span(
          [
            h.Class(
              "ml-auto inline-flex h-[18px] min-w-[18px] rotate-3 items-center justify-center rounded-[2px] bg-accent px-1 font-mono text-[10px] font-bold leading-none text-on-accent shadow-sm",
            ),
            h.AriaHidden(true),
            h.DataAttribute("unread-badge", ""),
          ],
          [unreadBadgeText(count)],
        ),
        h.span([h.Class("sr-only")], [`${count} unread`]),
      ]

const logo = (h: HtmlBuilder<Message>): Html =>
  h.a(
    [
      h.Href("/"),
      h.Title("Inkpipe"),
      h.Class("flex items-center gap-2 font-display text-lg italic text-primary no-underline"),
    ],
    [Icon.inkpipeMark(20), h.span([h.Class("spine-label")], ["Inkpipe"])],
  )

const navContent = (model: Model, route: AppRoute, h: HtmlBuilder<Message>): Html => {
  const pathname = routeToPath(route)

  return h.nav(
    [h.Class("flex h-full flex-col"), h.AriaLabel("Primary")],
    [
      h.div([h.Class("border-b border-border px-5 py-4")], [logo(h)]),
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
                  trailing: item.path === "/watches" ? unreadBadge(model.unreadCount, h) : [],
                }),
              ]
            : [
                h.div(
                  [
                    h.Title(item.label),
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
                ...(item.label === "Utils"
                  ? Option.match(model.maybeCopypartyUrl, {
                      onNone: () => [],
                      onSome: (url) => [
                        h.a(
                          [
                            h.Href(url),
                            h.Title("Copyparty"),
                            h.Target("_blank"),
                            h.Rel("noopener noreferrer"),
                            h.Class("spine-link spine-link-sub"),
                          ],
                          [h.span([h.Class("spine-label")], ["Copyparty"])],
                        ),
                      ],
                    })
                  : []),
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
                  trailing: [
                    h.span(
                      [h.Class("ml-auto font-mono text-[9px] tracking-widest text-secondary")],
                      ["DEV"],
                    ),
                  ],
                }),
              ]
            : []),
        ],
      ),
    ],
  )
}

/** Desktop sidebar (xl and up). */
export const view = Submodel.defineView<Model, Message, ViewInputs>((model, { route }, h): Html =>
  h.aside(
    [
      h.Class(
        "sticky top-0 hidden h-screen w-[220px] shrink-0 border-r border-border bg-surface xl:flex xl:flex-col",
      ),
    ],
    [navContent(model, route, h)],
  ),
)

/** Top bar + slide-over drawer below xl. */
export const mobileView = Submodel.defineView<Model, Message, ViewInputs>(
  (model, { route }, h): Html => {
    const drawer = ({ dialog, backdrop, panel, title, isVisible }: Dialog.RenderInfo): Html =>
      h.dialog(
        [...dialog, h.Class("bg-transparent p-0 xl:hidden")],
        isVisible
          ? [
              h.div([...backdrop, h.Class("fixed inset-0 z-50 bg-black/50")]),
              h.div(
                [
                  ...panel,
                  h.Class(
                    "fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col border-r border-border bg-surface",
                  ),
                ],
                [h.h2([...title, h.Class("sr-only")], ["Navigation"]), navContent(model, route, h)],
              ),
            ]
          : [],
      )

    return h.div(
      [],
      [
        h.header(
          [
            h.Class(
              "fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface px-4 xl:hidden",
            ),
          ],
          [
            logo(h),
            h.button(
              [
                h.Type("button"),
                h.AriaLabel("Open navigation"),
                h.AriaExpanded(model.mobileNav.isOpen),
                h.OnClick(Message.ClickedOpenMobileNav()),
                h.Class(
                  "flex h-9 w-9 items-center justify-center rounded-[3px] border border-border bg-surface text-secondary",
                ),
              ],
              [Icon.menu("h-[18px] w-[18px]")],
            ),
          ],
        ),
        h.submodel({
          slotId: model.mobileNav.id,
          model: model.mobileNav,
          view: Dialog.view,
          viewInputs: { toView: drawer },
          toParentMessage: (message) => Message.GotMobileNavMessage({ message }),
        }),
      ],
    )
  },
)
