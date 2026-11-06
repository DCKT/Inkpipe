import { Effect, Option, Schema } from "effect"
import { Command, type Runtime, Subscription, Update } from "foldkit"
import type { Document, Html, HtmlBuilder } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { UrlRequest, load, pushUrl } from "foldkit/navigation"
import { modifyFields } from "foldkit/struct"
import { Url, toString as urlToString } from "foldkit/url"

import type { ApiClientService } from "./api"
import * as AnnasArchive from "./annasArchive"
import * as Convert from "./convert"
import * as Jobs from "./jobs"
import * as Komga from "./komga"
import * as Latest from "./latest"
import * as Prowlarr from "./prowlarr"
import * as Settings from "./settings"
import * as Sidebar from "./sidebar"
import { toastEntryClass, toastEntryView } from "./toastView"
import { Toast, ToastRequest, initialToasts, toShowInput, toast } from "./toast"
import { AppRoute, routeTitle, urlToAppRoute } from "./route"

export { AppRoute } from "./route"

// MODEL

export const Model = Schema.Struct({
  route: AppRoute,
  toasts: Toast.Model,
  sidebar: Sidebar.Model,
  jobs: Jobs.Model,
  settings: Settings.Model,
  prowlarr: Prowlarr.Model,
  latest: Latest.Model,
  annasArchive: AnnasArchive.Model,
  convert: Convert.Model,
  komga: Komga.Model,
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
  GotSettingsMessage: { message: Settings.Message },
  GotProwlarrMessage: { message: Prowlarr.Message },
  GotLatestMessage: { message: Latest.Message },
  GotAnnasArchiveMessage: { message: AnnasArchive.Message },
  GotConvertMessage: { message: Convert.Message },
  GotKomgaMessage: { message: Komga.Message },
  RequestedToast: { request: ToastRequest },
})

export type Message = typeof Message.Type

// INIT

const initialProwlarr = (route: AppRoute) =>
  route._tag === "Prowlarr" ? Prowlarr.enter(Prowlarr.init()) : { model: Prowlarr.init() }

const initialLatest = (route: AppRoute) =>
  route._tag === "Latest" ? Latest.enter(Latest.init()) : { model: Latest.init() }

const initialAnnasArchive = (route: AppRoute) =>
  route._tag === "AnnasArchive"
    ? AnnasArchive.enter(AnnasArchive.init())
    : { model: AnnasArchive.init() }

const initialConvert = (route: AppRoute) =>
  route._tag === "Convert" ? Convert.enter(Convert.init()) : { model: Convert.init() }

const initialKomga = (route: AppRoute) =>
  route._tag === "Komga" ? Komga.enter(Komga.init()) : { model: Komga.init() }

const initialSettings = (route: AppRoute) =>
  route._tag === "Settings"
    ? Settings.enter(Option.isSome(route.komgaNotConfigured))
    : Settings.init()

export const init: Runtime.RoutingApplicationInit<Model, Message, void, AppResources> = (url) => {
  const route = urlToAppRoute(url)

  return Update.foldChildInits(
    {
      sidebar: Sidebar.init(),
      jobs: Jobs.init(),
      settings: initialSettings(route),
      prowlarr: initialProwlarr(route),
      latest: initialLatest(route),
      annasArchive: initialAnnasArchive(route),
      convert: initialConvert(route),
      komga: initialKomga(route),
    },
    {
      toParentModel: ({
        sidebar,
        jobs,
        settings,
        prowlarr,
        latest,
        annasArchive,
        convert,
        komga,
      }) => ({
        route,
        toasts: initialToasts(),
        sidebar,
        jobs,
        settings,
        prowlarr,
        latest,
        annasArchive,
        convert,
        komga,
      }),
      folds: {
        sidebar: { toParentMessage: (message) => Message.GotSidebarMessage({ message }) },
        jobs: { toParentMessage: (message) => Message.GotJobsMessage({ message }) },
        settings: {
          toParentMessage: (message) => Message.GotSettingsMessage({ message }),
          foldOutMessage: foldSettingsOutMessage,
        },
        prowlarr: {
          toParentMessage: (message) => Message.GotProwlarrMessage({ message }),
          foldOutMessage: foldProwlarrOutMessage,
        },
        latest: {
          toParentMessage: (message) => Message.GotLatestMessage({ message }),
          foldOutMessage: foldLatestOutMessage,
        },
        annasArchive: {
          toParentMessage: (message) => Message.GotAnnasArchiveMessage({ message }),
          foldOutMessage: foldAnnasArchiveOutMessage,
        },
        convert: {
          toParentMessage: (message) => Message.GotConvertMessage({ message }),
          foldOutMessage: foldConvertOutMessage,
        },
        komga: {
          toParentMessage: (message) => Message.GotKomgaMessage({ message }),
          foldOutMessage: foldKomgaOutMessage,
        },
      },
    },
  )
}

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

const foldRefreshCopypartyUrl = Update.foldChildStep({
  update: Sidebar.refreshCopypartyUrl,
  read: (model: Model) => Option.some(model.sidebar),
  write: (model, sidebar) => modifyFields(model, { sidebar: () => sidebar }),
  toParentMessage: (message) => Message.GotSidebarMessage({ message }),
})

const foldSettingsOutMessage = Settings.OutMessage.match<Step>({
  RequestedToast:
    ({ request }) =>
    (model) =>
      foldToastShow(model, toShowInput(request)),
  SavedSettings: () => (model) =>
    Update.combine(model, [
      (stepModel) =>
        foldToastShow(stepModel, toShowInput(toast.success("Settings saved successfully."))),
      foldRefreshCopypartyUrl,
    ]),
  ImportedSettings: () => (model) =>
    Update.combine(model, [
      (stepModel) =>
        foldToastShow(stepModel, toShowInput(toast.success("Settings imported successfully."))),
      foldRefreshCopypartyUrl,
    ]),
})

const foldProwlarrOutMessage = Prowlarr.OutMessage.match<Step>({
  RequestedToast:
    ({ request }) =>
    (model) =>
      foldToastShow(model, toShowInput(request)),
})

const prowlarrFold = {
  read: (model: Model) => Option.some(model.prowlarr),
  write: (model: Model, prowlarr: Prowlarr.Model) =>
    modifyFields(model, { prowlarr: () => prowlarr }),
  toParentMessage: (message: Prowlarr.Message) => Message.GotProwlarrMessage({ message }),
  foldOutMessage: foldProwlarrOutMessage,
}

const foldProwlarr = Update.foldChild({ update: Prowlarr.update, ...prowlarrFold })
const foldEnterProwlarr = Update.foldChildStep({ update: Prowlarr.enter, ...prowlarrFold })

const foldLatestOutMessage = Latest.OutMessage.match<Step>({
  RequestedToast:
    ({ request }) =>
    (model) =>
      foldToastShow(model, toShowInput(request)),
})

const latestFold = {
  read: (model: Model) => Option.some(model.latest),
  write: (model: Model, latest: Latest.Model) => modifyFields(model, { latest: () => latest }),
  toParentMessage: (message: Latest.Message) => Message.GotLatestMessage({ message }),
  foldOutMessage: foldLatestOutMessage,
}

const foldLatest = Update.foldChild({ update: Latest.update, ...latestFold })
const foldEnterLatest = Update.foldChildStep({ update: Latest.enter, ...latestFold })

const foldAnnasArchiveOutMessage = AnnasArchive.OutMessage.match<Step>({
  RequestedToast:
    ({ request }) =>
    (model) =>
      foldToastShow(model, toShowInput(request)),
})

const annasArchiveFold = {
  read: (model: Model) => Option.some(model.annasArchive),
  write: (model: Model, annasArchive: AnnasArchive.Model) =>
    modifyFields(model, { annasArchive: () => annasArchive }),
  toParentMessage: (message: AnnasArchive.Message) => Message.GotAnnasArchiveMessage({ message }),
  foldOutMessage: foldAnnasArchiveOutMessage,
}

const foldAnnasArchive = Update.foldChild({ update: AnnasArchive.update, ...annasArchiveFold })
const foldEnterAnnasArchive = Update.foldChildStep({
  update: AnnasArchive.enter,
  ...annasArchiveFold,
})

const foldConvertOutMessage = Convert.OutMessage.match<Step>({
  RequestedToast:
    ({ request }) =>
    (model) =>
      foldToastShow(model, toShowInput(request)),
  // Only if the user is still looking at Convert when the answer arrives.
  RequestedSettings: () => (model) =>
    model.route._tag === "Convert"
      ? { model, commands: [NavigateInternal({ url: "/settings" })] }
      : { model },
})

const convertFold = {
  read: (model: Model) => Option.some(model.convert),
  write: (model: Model, convert: Convert.Model) => modifyFields(model, { convert: () => convert }),
  toParentMessage: (message: Convert.Message) => Message.GotConvertMessage({ message }),
  foldOutMessage: foldConvertOutMessage,
}

const foldConvert = Update.foldChild({ update: Convert.update, ...convertFold })
const foldEnterConvert = Update.foldChildStep({ update: Convert.enter, ...convertFold })

const foldKomgaOutMessage = Komga.OutMessage.match<Step>({
  // Only if the user is still on the Komga page when the answer arrives.
  RequestedSettings: () => (model) =>
    model.route._tag === "Komga"
      ? { model, commands: [NavigateInternal({ url: "/settings?komgaNotConfigured=true" })] }
      : { model },
})

const komgaFold = {
  read: (model: Model) => Option.some(model.komga),
  write: (model: Model, komga: Komga.Model) => modifyFields(model, { komga: () => komga }),
  toParentMessage: (message: Komga.Message) => Message.GotKomgaMessage({ message }),
  foldOutMessage: foldKomgaOutMessage,
}

const foldKomga = Update.foldChild({ update: Komga.update, ...komgaFold })
const foldEnterKomga = Update.foldChildStep({ update: Komga.enter, ...komgaFold })

const settingsFold = {
  read: (model: Model) => Option.some(model.settings),
  write: (model: Model, settings: Settings.Model) =>
    modifyFields(model, { settings: () => settings }),
  toParentMessage: (message: Settings.Message) => Message.GotSettingsMessage({ message }),
  foldOutMessage: foldSettingsOutMessage,
}

const foldSettings = Update.foldChild({ update: Settings.update, ...settingsFold })

/** Entering the page reloads it from the server, so stale edits never linger. */
const foldEnterSettings = (isKomgaNotConfigured: boolean) =>
  Update.foldChildStep({
    update: () => Settings.enter(isKomgaNotConfigured),
    ...settingsFold,
  })

const enterPage = (previous: AppRoute, next: AppRoute): Step => {
  if (next._tag === "Settings" && previous._tag !== "Settings") {
    return foldEnterSettings(Option.isSome(next.komgaNotConfigured))
  }

  if (next._tag === "Prowlarr" && previous._tag !== "Prowlarr") {
    return foldEnterProwlarr
  }

  if (next._tag === "Latest" && previous._tag !== "Latest") {
    return foldEnterLatest
  }

  if (next._tag === "AnnasArchive" && previous._tag !== "AnnasArchive") {
    return foldEnterAnnasArchive
  }

  if (next._tag === "Convert" && previous._tag !== "Convert") {
    return foldEnterConvert
  }

  if (next._tag === "Komga" && previous._tag !== "Komga") {
    return foldEnterKomga
  }

  return (model) => ({ model })
}

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
    ChangedUrl: ({ url }) => {
      const nextRoute = urlToAppRoute(url)

      return Update.combine(model, [
        setRoute(nextRoute),
        enterPage(model.route, nextRoute),
        foldCloseMobileNav,
      ])
    },

    GotToastMessage: ({ message }) => foldToast(model, message),

    GotSidebarMessage: ({ message }) => foldSidebar(model, message),

    GotJobsMessage: ({ message }) => foldJobs(model, message),

    GotSettingsMessage: ({ message }) => foldSettings(model, message),

    GotProwlarrMessage: ({ message }) => foldProwlarr(model, message),

    GotLatestMessage: ({ message }) => foldLatest(model, message),

    GotAnnasArchiveMessage: ({ message }) => foldAnnasArchive(model, message),

    GotConvertMessage: ({ message }) => foldConvert(model, message),

    GotKomgaMessage: ({ message }) => foldKomga(model, message),

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

const pageView = (model: Model, h: HtmlBuilder<Message>): Html =>
  AppRoute.match(model.route, {
    Settings: () =>
      h.submodel({
        slotId: "settings",
        model: model.settings,
        view: Settings.view,
        toParentMessage: (message) => Message.GotSettingsMessage({ message }),
      }),
    Prowlarr: () =>
      h.submodel({
        slotId: "prowlarr",
        model: model.prowlarr,
        view: Prowlarr.view,
        toParentMessage: (message) => Message.GotProwlarrMessage({ message }),
      }),
    Latest: () =>
      h.submodel({
        slotId: "latest",
        model: model.latest,
        view: Latest.view,
        toParentMessage: (message) => Message.GotLatestMessage({ message }),
      }),
    AnnasArchive: () =>
      h.submodel({
        slotId: "annas-archive",
        model: model.annasArchive,
        view: AnnasArchive.view,
        toParentMessage: (message) => Message.GotAnnasArchiveMessage({ message }),
      }),
    Komga: () =>
      h.submodel({
        slotId: "komga",
        model: model.komga,
        view: Komga.view,
        toParentMessage: (message) => Message.GotKomgaMessage({ message }),
      }),
    Watches: () => placeholderPage(model.route, h),
    WatchDetail: () => placeholderPage(model.route, h),
    Convert: () =>
      h.submodel({
        slotId: "convert",
        model: model.convert,
        view: Convert.view,
        toParentMessage: (message) => Message.GotConvertMessage({ message }),
      }),
    Debug: () => placeholderPage(model.route, h),
    NotFound: () => placeholderPage(model.route, h),
  })

/** Pages not ported yet render their title only. */
const placeholderPage = (route: AppRoute, h: HtmlBuilder<Message>): Html =>
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
      h.div([h.Class("min-w-0 flex-1 pt-14 xl:pt-0")], [pageView(model, h)]),
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
