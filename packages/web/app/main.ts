import { Effect, Option, Schema } from "effect"
import { Command, type Runtime, Subscription, Update } from "foldkit"
import type { Document, Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { UrlRequest, load, pushUrl } from "foldkit/navigation"
import { modifyFields } from "foldkit/struct"
import { Url, toString as urlToString } from "foldkit/url"

import type { ApiClientService } from "./api"
import * as Jobs from "./jobs"
import * as Sidebar from "./sidebar"
import { toastEntryClass, toastEntryView } from "./toastView"
import { Toast, ToastRequest, initialToasts, toShowInput } from "./toast"
import { AppRoute, routeTitle, urlToAppRoute } from "./route"

export { AppRoute } from "./route"

// MODEL

export const Model = Schema.Struct({
  route: AppRoute,
  toasts: Toast.Model,
  sidebar: Sidebar.Model,
  jobs: Jobs.Model,
})

export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  GotToastMessage: { message: Toast.Message },
  GotSidebarMessage: { message: Sidebar.Message },
  GotJobsMessage: { message: Jobs.Message },
  RequestedToast: { request: ToastRequest },
})

export type Message = typeof Message.Type

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message, void, AppResources> = (url) =>
  Update.foldChildInits(
    { sidebar: Sidebar.init(), jobs: Jobs.init() },
    {
      toParentModel: ({ sidebar, jobs }) => ({
        route: urlToAppRoute(url),
        toasts: initialToasts(),
        sidebar,
        jobs,
      }),
      folds: {
        sidebar: { toParentMessage: (message) => Message.GotSidebarMessage({ message }) },
        jobs: { toParentMessage: (message) => Message.GotJobsMessage({ message }) },
      },
    },
  )

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

/** Services Commands may require; supplied by `resources` in entry.ts. */
export type AppResources = ApiClientService

type UpdateReturn = Update.Return<Model, Message, AppResources>
type Step = Update.Step<Model, Message, AppResources>

const foldToastOutMessage = Toast.OutMessage.match<Update.Step<Model, Message>>({
  DismissedToast: () => (model) => ({ model }),
})

const foldToast = Update.foldChild({
  update: Toast.update,
  read: (model: Model) => Option.some(model.toasts),
  write: (model, toasts) => modifyFields(model, { toasts: () => toasts }),
  toParentMessage: (message) => Message.GotToastMessage({ message }),
  foldOutMessage: foldToastOutMessage,
})

const foldToastShow = Update.foldChild({
  update: Toast.show,
  read: (model: Model) => Option.some(model.toasts),
  write: (model, toasts) => modifyFields(model, { toasts: () => toasts }),
  toParentMessage: (message) => Message.GotToastMessage({ message }),
  foldOutMessage: foldToastOutMessage,
})

const foldSidebar = Update.foldChild({
  update: Sidebar.update,
  read: (model: Model) => Option.some(model.sidebar),
  write: (model, sidebar) => modifyFields(model, { sidebar: () => sidebar }),
  toParentMessage: (message) => Message.GotSidebarMessage({ message }),
})

const foldJobs = Update.foldChild({
  update: Jobs.update,
  read: (model: Model) => Option.some(model.jobs),
  write: (model, jobs) => modifyFields(model, { jobs: () => jobs }),
  toParentMessage: (message) => Message.GotJobsMessage({ message }),
})

const foldCloseMobileNav = Update.foldChildStep({
  update: Sidebar.closeMobileNav,
  read: (model: Model) => Option.some(model.sidebar),
  write: (model, sidebar) => modifyFields(model, { sidebar: () => sidebar }),
  toParentMessage: (message) => Message.GotSidebarMessage({ message }),
})

const setRoute =
  (route: AppRoute): Step =>
  (model) => ({ model: modifyFields(model, { route: () => route }) })

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),

    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({ model, commands: [NavigateInternal({ url: urlToString(url) })] }),
        External: ({ href }) => ({ model, commands: [LoadExternal({ href })] }),
      }),

    // Navigating always dismisses the mobile drawer.
    ChangedUrl: ({ url }) =>
      Update.combine(model, [setRoute(urlToAppRoute(url)), foldCloseMobileNav]),

    GotToastMessage: ({ message }) => foldToast(model, message),

    GotSidebarMessage: ({ message }) => foldSidebar(model, message),

    GotJobsMessage: ({ message }) => foldJobs(model, message),

    RequestedToast: ({ request }) => foldToastShow(model, toShowInput(request)),
  })

// SUBSCRIPTION

export const subscriptions = Subscription.aggregate(
  Subscription.lift(Toast.subscriptions)<Model, Message>({
    read: (model) => Option.some(model.toasts),
    toParentMessage: (message) => Message.GotToastMessage({ message }),
  }),
  Subscription.lift(Sidebar.subscriptions)<Model, Message>({
    read: (model) => Option.some(model.sidebar),
    toParentMessage: (message) => Message.GotSidebarMessage({ message }),
  }),
  Subscription.lift(Jobs.subscriptions)<Model, Message>({
    read: (model) => Option.some(model.jobs),
    toParentMessage: (message) => Message.GotJobsMessage({ message }),
  }),
)

// VIEW

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
      h.submodel({
        slotId: "sidebar",
        model: model.sidebar,
        view: Sidebar.view,
        viewInputs: { route: model.route },
        toParentMessage: (message) => Message.GotSidebarMessage({ message }),
      }),
      h.submodel({
        slotId: "mobile-nav",
        model: model.sidebar,
        view: Sidebar.mobileView,
        viewInputs: { route: model.route },
        toParentMessage: (message) => Message.GotSidebarMessage({ message }),
      }),
      h.div([h.Class("min-w-0 flex-1 pt-14 xl:pt-0")], [pageView(model.route, h)]),
      h.submodel({
        slotId: "jobs",
        model: model.jobs,
        view: Jobs.view,
        toParentMessage: (message) => Message.GotJobsMessage({ message }),
      }),
      h.submodel({
        slotId: model.toasts.id,
        model: model.toasts,
        view: Toast.view,
        viewInputs: {
          position: "BottomRight",
          entryToView: (entry, handlers) => toastEntryView(entry, handlers, h),
          entryClassName: toastEntryClass,
        },
        toParentMessage: (message) => Message.GotToastMessage({ message }),
      }),
    ],
  ),
})
