import { Schema, pipe } from "effect"
import { Route } from "foldkit"
import { defineRouteUnion, int, literal, slash } from "foldkit/route"

export const AppRoute = defineRouteUnion({
  Prowlarr: {},
  Latest: {},
  AnnasArchive: {},
  Komga: {},
  Watches: {},
  WatchDetail: { watchId: Schema.Int },
  Convert: {},
  /** `?komgaNotConfigured=true` is how the Komga page sends people here. */
  Settings: { komgaNotConfigured: Schema.Option(Schema.Literal("true")) },
  Debug: {},
  NotFound: { path: Schema.String },
})

export type AppRoute = typeof AppRoute.Type

export const prowlarrRouter = pipe(Route.root, Route.mapTo(AppRoute.Prowlarr))
export const latestRouter = pipe(literal("latest"), Route.mapTo(AppRoute.Latest))
export const annasArchiveRouter = pipe(literal("annas-archive"), Route.mapTo(AppRoute.AnnasArchive))
export const komgaRouter = pipe(literal("komga"), Route.mapTo(AppRoute.Komga))
export const watchesRouter = pipe(literal("watches"), Route.mapTo(AppRoute.Watches))
export const watchDetailRouter = pipe(
  literal("watches"),
  slash(int("watchId")),
  Route.mapTo(AppRoute.WatchDetail),
)
export const convertRouter = pipe(literal("convert"), Route.mapTo(AppRoute.Convert))
export const settingsRouter = pipe(
  literal("settings"),
  Route.query(
    Schema.Struct({ komgaNotConfigured: Schema.OptionFromOptional(Schema.Literal("true")) }),
  ),
  Route.mapTo(AppRoute.Settings),
)
export const debugRouter = pipe(literal("debug"), Route.mapTo(AppRoute.Debug))

const routeParser = Route.oneOf(
  watchDetailRouter,
  watchesRouter,
  latestRouter,
  annasArchiveRouter,
  komgaRouter,
  convertRouter,
  settingsRouter,
  debugRouter,
  prowlarrRouter,
)

export const urlToAppRoute = Route.parseUrlWithFallback(routeParser, AppRoute.NotFound)

/** Canonical pathname (no query) for a route — used for nav highlighting. */
export const routeToPath = (route: AppRoute): string =>
  AppRoute.match(route, {
    Prowlarr: prowlarrRouter,
    Latest: latestRouter,
    AnnasArchive: annasArchiveRouter,
    Komga: komgaRouter,
    Watches: watchesRouter,
    WatchDetail: ({ watchId }) => watchDetailRouter({ watchId }),
    Convert: convertRouter,
    Settings: ({ komgaNotConfigured }) => settingsRouter({ komgaNotConfigured }),
    Debug: debugRouter,
    NotFound: ({ path }) => path,
  }).split("?")[0] ?? "/"

export const routeTitle = (route: AppRoute): string =>
  AppRoute.match(route, {
    Prowlarr: () => "Search · Inkpipe",
    Latest: () => "Latest · Inkpipe",
    AnnasArchive: () => "Anna's Archive · Inkpipe",
    Komga: () => "Komga · Inkpipe",
    Watches: () => "Watches · Inkpipe",
    WatchDetail: () => "Watch · Inkpipe",
    Convert: () => "CBZ to EPUB · Inkpipe",
    Settings: () => "Settings · Inkpipe",
    Debug: () => "Debug · Inkpipe",
    NotFound: () => "Not found · Inkpipe",
  })
