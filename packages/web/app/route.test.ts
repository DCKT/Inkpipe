import { Option } from "effect"
import { fromString } from "foldkit/url"
import { describe, expect, test } from "vitest"

import { AppRoute, routeToPath, routeTitle, urlToAppRoute } from "./route"

const parse = (path: string): AppRoute =>
  urlToAppRoute(
    Option.getOrThrowWith(
      fromString(`http://localhost${path}`),
      () => new Error(`bad url ${path}`),
    ),
  )

describe("urlToAppRoute", () => {
  test.each([
    ["/", "Prowlarr"],
    ["/latest", "Latest"],
    ["/annas-archive", "AnnasArchive"],
    ["/komga", "Komga"],
    ["/watches", "Watches"],
    ["/convert", "Convert"],
    ["/debug", "Debug"],
  ] as const)("%s -> %s", (path, tag) => {
    expect(parse(path)._tag).toBe(tag)
  })

  test("/settings carries the optional komgaNotConfigured flag", () => {
    expect(parse("/settings")).toStrictEqual(
      AppRoute.Settings({ komgaNotConfigured: Option.none() }),
    )
    expect(parse("/settings?komgaNotConfigured=true")).toStrictEqual(
      AppRoute.Settings({ komgaNotConfigured: Option.some("true") }),
    )
  })

  test("any other komgaNotConfigured value is not a valid flag", () => {
    expect(parse("/settings?komgaNotConfigured=nope")._tag).not.toBe("Settings")
  })

  test("/watches/:id captures the numeric id", () => {
    expect(parse("/watches/42")).toStrictEqual(AppRoute.WatchDetail({ watchId: 42 }))
  })

  test("trailing slashes and repeated slashes are tolerated (pinned against Foldkit upgrades)", () => {
    expect(parse("/watches/")._tag).toBe("Watches")
    expect(parse("/watches/3/")).toStrictEqual(AppRoute.WatchDetail({ watchId: 3 }))
    expect(parse("//")._tag).toBe("Prowlarr")
  })

  test("query strings and hashes do not affect which page matches", () => {
    expect(parse("/watches?x=1")._tag).toBe("Watches")
    expect(parse("/komga#top")._tag).toBe("Komga")
  })

  test.each(["/watches/abc", "/watches/1.5", "/watches/1/extra", "/nope", "/latest/extra"])(
    "%s falls through to NotFound carrying the path",
    (path) => {
      const route = parse(path)
      expect(route._tag).toBe("NotFound")
      if (route._tag === "NotFound") expect(route.path).toBe(path)
    },
  )
})

describe("routeToPath", () => {
  test.each([
    "/",
    "/latest",
    "/annas-archive",
    "/komga",
    "/watches",
    "/watches/7",
    "/convert",
    "/settings",
    "/debug",
  ])("round-trips %s", (path) => {
    expect(routeToPath(parse(path))).toBe(path)
  })

  test("Settings maps to its bare path even with the flag set", () => {
    expect(routeToPath(parse("/settings?komgaNotConfigured=true"))).toBe("/settings")
  })

  test("NotFound keeps the unmatched path", () => {
    expect(routeToPath(AppRoute.NotFound({ path: "/x" }))).toBe("/x")
  })
})

describe("routeTitle", () => {
  test("every route has a distinct, branded title", () => {
    const routes = [
      "/",
      "/latest",
      "/annas-archive",
      "/komga",
      "/watches",
      "/watches/1",
      "/convert",
      "/settings",
      "/debug",
      "/nope",
    ].map(parse)
    const titles = routes.map(routeTitle)
    expect(new Set(titles).size).toBe(titles.length)
    for (const title of titles) expect(title.endsWith("Inkpipe")).toBe(true)
  })
})
