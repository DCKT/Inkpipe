import { Effect, Option } from "effect"
import { AsyncData } from "foldkit"
import {
  Command,
  click,
  expect as sceneExpect,
  given,
  label,
  role,
  scene,
  selector,
  text,
  type,
} from "foldkit/scene"
import { fromString as parseUrl } from "foldkit/url"
import { afterEach, describe, expect, test, vi } from "vitest"

import * as Debug from "./debug"
import { AppRoute, Message, init, update, view } from "./main"
import * as Push from "./push"
import { modelAt } from "./testing"

const indexOf = (group: string, name: string): number =>
  Debug.ENDPOINTS.findIndex((e) => e.group === group && e.label === name)

const search = indexOf("Search", "Search")
const latest = indexOf("Search", "Latest")
const createFolder = indexOf("Copyparty", "Create Folder")

const select = (model: Debug.Model, index: number): Debug.Model =>
  Debug.update(model, Debug.Message.ClickedEndpoint({ index })).model

const names = (result: { readonly commands?: ReadonlyArray<{ readonly name: string }> }) =>
  result.commands?.map((c) => c.name) ?? []

const okResponse = { status: 200, contentType: "application/json", body: "{}" }

describe("pure helpers", () => {
  test("every endpoint is findable and the groups keep order and indexes", () => {
    const groups = Debug.groupedEndpoints()
    expect(groups.map((g) => g.group)).toStrictEqual([
      "Search",
      "Komga",
      "Copyparty",
      "Convert",
      "Settings",
      "Jobs",
      "Push",
    ])
    expect(
      groups.flatMap((g) => g.entries.map((e) => e.index)).sort((a, b) => a - b),
    ).toStrictEqual(Debug.ENDPOINTS.map((_, i) => i))
    expect(Debug.endpointAt(999)).toStrictEqual(Option.none())
  })

  test("the url carries a trimmed query value only when the endpoint takes one", () => {
    const q = Debug.ENDPOINTS[search]!
    expect(Debug.requestUrl("http://x", q, "  one piece ")).toBe("http://x/api/search?q=one+piece")
    expect(Debug.requestUrl("http://x", q, "  ")).toBe("http://x/api/search")
    expect(Debug.requestUrl("", q, "a&b=c")).toBe("/api/search?q=a%26b%3Dc")
    expect(Debug.requestUrl("http://x", Debug.ENDPOINTS[latest]!, "ignored")).toBe(
      "http://x/api/latest",
    )
  })

  test("the starting body names the endpoint's field", () => {
    expect(Debug.initialBody(Debug.ENDPOINTS[createFolder]!)).toBe('{\n  "name": ""\n}')
    expect(Debug.initialBody(Debug.ENDPOINTS[latest]!)).toBe("")
  })

  test("what to send as the body", () => {
    const post = Debug.ENDPOINTS[createFolder]!
    expect(Debug.requestBody(Debug.ENDPOINTS[latest]!, '{"x":1}')).toStrictEqual(
      Option.some(Option.none()),
    )
    expect(Debug.requestBody(post, "   ")).toStrictEqual(Option.some(Option.some("{}")))
    expect(Debug.requestBody(post, '{ "name" : "a" }')).toStrictEqual(
      Option.some(Option.some('{"name":"a"}')),
    )
    expect(Debug.requestBody(post, "{nope")).toStrictEqual(Option.none())
  })

  test("JSON is pretty-printed and anything else is left alone", () => {
    expect(Debug.prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}')
    expect(Debug.prettyJson("<html>")).toBe("<html>")
    expect(Debug.prettyJson("")).toBe("")
  })

  test("success is 2xx", () => {
    expect([199, 200, 299, 300, 404].map(Debug.isSuccessStatus)).toStrictEqual([
      false,
      true,
      true,
      false,
      false,
    ])
  })

  test("status wording", () => {
    expect(Debug.statusLabel(Option.none())).toBe("unknown")
    expect(Debug.statusLabel(Option.some("Subscribed"))).toBe("subscribed")
    expect(Debug.statusLabel(Option.some("Denied"))).toBe("denied")
    expect(Debug.statusLabel(Option.some("Default"))).toBe("default")
  })
})

describe("update", () => {
  test("selecting an endpoint resets the form and the previous answer", () => {
    const used = Debug.update(
      Debug.update(select(Debug.init(true), search), Debug.Message.ChangedQuery({ value: "x" }))
        .model,
      Debug.Message.ClickedSend(),
    ).model
    const next = select(used, createFolder)
    expect(next.queryValue).toBe("")
    expect(next.bodyValue).toBe('{\n  "name": ""\n}')
    expect(AsyncData.isIdle(next.response)).toBe(true)
  })

  test("picking another endpoint while sending drops the pending answer", () => {
    const sent = Debug.update(select(Debug.init(true), latest), Debug.Message.ClickedSend()).model
    const moved = select(sent, search)
    expect(AsyncData.isIdle(moved.response)).toBe(true)
    // ...and Send works again for the new endpoint.
    expect(names(Debug.update(moved, Debug.Message.ClickedSend()))).toStrictEqual([
      "SendDebugRequest",
    ])
  })

  test("an unknown endpoint index is ignored", () => {
    const model = Debug.init(true)
    expect(Debug.update(model, Debug.Message.ClickedEndpoint({ index: 999 })).model).toStrictEqual(
      model,
    )
  })

  test("sending does nothing until an endpoint is picked", () => {
    expect(names(Debug.update(Debug.init(true), Debug.Message.ClickedSend()))).toStrictEqual([])
  })

  test("send builds the request from the form and is single-flight", () => {
    const typed = Debug.update(
      select(Debug.init(true), search),
      Debug.Message.ChangedQuery({ value: " bleach " }),
    ).model
    const sent = Debug.update(typed, Debug.Message.ClickedSend())
    expect(names(sent)).toStrictEqual(["SendDebugRequest"])
    expect(AsyncData.isPending(sent.model.response)).toBe(true)
    expect(names(Debug.update(sent.model, Debug.Message.ClickedSend()))).toStrictEqual([])
  })

  test("invalid JSON never reaches the network", () => {
    const bad = Debug.update(
      select(Debug.init(true), createFolder),
      Debug.Message.ChangedBody({ value: "{nope" }),
    ).model
    const sent = Debug.update(bad, Debug.Message.ClickedSend())
    expect(names(sent)).toStrictEqual([])
    expect(AsyncData.getError(sent.model.response)).toStrictEqual(Option.some("Invalid JSON body"))
  })

  test("answers fill the panel; failures show their reason", () => {
    const sent = Debug.update(select(Debug.init(true), latest), Debug.Message.ClickedSend()).model
    const done = Debug.update(
      sent,
      Debug.Message.SucceededRequest({ seq: sent.requestSeq, response: okResponse }),
    ).model
    expect(AsyncData.getData(done.response)).toStrictEqual(Option.some(okResponse))
    const failed = Debug.update(
      sent,
      Debug.Message.FailedRequest({ seq: sent.requestSeq, reason: "Failed to fetch" }),
    ).model
    expect(AsyncData.getError(failed.response)).toStrictEqual(Option.some("Failed to fetch"))
  })

  test("a late answer for a previous request or endpoint is ignored", () => {
    const sent = Debug.update(select(Debug.init(true), latest), Debug.Message.ClickedSend()).model
    const moved = select(sent, search)
    const late = Debug.update(
      moved,
      Debug.Message.SucceededRequest({ seq: sent.requestSeq, response: okResponse }),
    ).model
    expect(AsyncData.isIdle(late.response)).toBe(true)
    const lateFailure = Debug.update(
      moved,
      Debug.Message.FailedRequest({ seq: sent.requestSeq, reason: "Failed to fetch" }),
    ).model
    expect(AsyncData.isIdle(lateFailure.response)).toBe(true)
    const resent = Debug.update(sent, Debug.Message.ClickedSend()).model
    expect(resent).toStrictEqual(sent)
  })

  test("the test notification result clears itself, but only its own timer", () => {
    const first = Debug.update(Debug.init(true), Debug.Message.SucceededTestNotification())
    expect(first.model.maybeTestResult).toStrictEqual(Option.some("Test notification sent"))
    expect(names(first)).toStrictEqual(["ClearTestResult"])
    const second = Debug.update(first.model, Debug.Message.FailedTestNotification())
    expect(second.model.maybeTestResult).toStrictEqual(
      Option.some("Failed to send test notification"),
    )
    // The first message's timer fires while the second is showing.
    expect(
      Debug.update(second.model, Debug.Message.ClearedTestResult({ seq: first.model.testSeq }))
        .model.maybeTestResult,
    ).toStrictEqual(Option.some("Failed to send test notification"))
    expect(
      Debug.update(second.model, Debug.Message.ClearedTestResult({ seq: second.model.testSeq }))
        .model.maybeTestResult,
    ).toStrictEqual(Option.none())
  })

  test("push messages reach the push model", () => {
    const enabling = Debug.update(
      Debug.init(true),
      Debug.Message.GotPushMessage({ message: Push.Message.ClickedEnable() }),
    )
    expect(enabling.model.push.isWorking).toBe(true)
    expect(names(enabling)).toStrictEqual(["EnablePush"])
  })

  test("entering checks push support, only where the explorer is enabled", () => {
    expect(names(Debug.enter(Debug.init(true)))).toStrictEqual(["DetectPushStatus"])
    expect(names(Debug.enter(Debug.init(false)))).toStrictEqual([])
  })
})

describe("Commands", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const run = <A>(program: Effect.Effect<A>) => Effect.runPromise(program)

  test("sends the method, url and JSON body, and pretty-prints a JSON answer", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response('{"a":1}', {
        status: 201,
        headers: { "content-type": "application/json" },
      })
    })
    const result = await run(
      Debug.SendRequest({
        seq: 3,
        method: "POST",
        url: "http://x/api/copyparty/folders",
        body: Option.some('{"name":"a"}'),
        binary: false,
      }).effect,
    )
    expect(result).toStrictEqual(
      Debug.Message.SucceededRequest({
        seq: 3,
        response: { status: 201, contentType: "application/json", body: '{\n  "a": 1\n}' },
      }),
    )
    expect(calls[0]?.init?.method).toBe("POST")
    expect(calls[0]?.init?.body).toBe('{"name":"a"}')
    expect(calls[0]?.init?.headers).toStrictEqual({ "Content-Type": "application/json" })
  })

  test("a GET carries no body or content type", async () => {
    const calls: Array<RequestInit | undefined> = []
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      calls.push(init)
      return new Response("plain", { status: 200 })
    })
    await run(
      Debug.SendRequest({ seq: 1, method: "GET", url: "/x", body: Option.none(), binary: false })
        .effect,
    )
    expect(calls[0]).toStrictEqual({ method: "GET" })
  })

  test("a binary answer is described, not read", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("bytes", {
          status: 200,
          headers: { "content-type": "image/png", "content-length": "5" },
        }),
    )
    const result = await run(
      Debug.SendRequest({ seq: 1, method: "GET", url: "/x", body: Option.none(), binary: true })
        .effect,
    )
    expect(result).toStrictEqual(
      Debug.Message.SucceededRequest({
        seq: 1,
        response: {
          status: 200,
          contentType: "image/png",
          body: "[Binary response: image/png, 5 bytes]",
        },
      }),
    )
  })

  test("an error status is still an answer; a network failure is a failure", async () => {
    vi.stubGlobal("fetch", async () => new Response('{"error":"no"}', { status: 500 }))
    const answered = await run(
      Debug.SendRequest({ seq: 1, method: "GET", url: "/x", body: Option.none(), binary: false })
        .effect,
    )
    expect(answered._tag).toBe("SucceededRequest")
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch")
    })
    const failed = await run(
      Debug.SendRequest({ seq: 2, method: "GET", url: "/x", body: Option.none(), binary: false })
        .effect,
    )
    expect(failed._tag).toBe("FailedRequest")
    expect(failed).toHaveProperty("reason", expect.stringContaining("Failed to fetch"))
  })
})

const withPage = (page: Debug.Model) => ({ ...modelAt(AppRoute.Debug()), debug: page })

describe("view", () => {
  test("outside development it only says so", () => {
    scene(
      { update, view },
      given(withPage(Debug.init(false))),
      sceneExpect(text("The debug page is only available in development mode.")).toExist(),
      sceneExpect(selector("[data-endpoint]")).toBeAbsent(),
    )
  })

  test("lists the endpoints, asks to pick one, and offers the Swagger docs", () => {
    scene(
      { update, view },
      given(withPage(Debug.init(true))),
      sceneExpect(role("heading", { name: "Debug — API Explorer" })).toExist(),
      sceneExpect(selector(`[data-endpoint='${search}']`)).toContainText("Search"),
      sceneExpect(selector(`[data-endpoint='${createFolder}']`)).toContainText("MUT"),
      sceneExpect(text("Select an endpoint from the sidebar to get started.")).toExist(),
      sceneExpect(selector("a[target='_blank']")).toContainText("Swagger"),
    )
  })

  test("the selected endpoint is marked pressed", () => {
    scene(
      { update, view },
      given(withPage(Debug.init(true))),
      sceneExpect(selector("[aria-pressed='true']")).toBeAbsent(),
      click(selector(`[data-endpoint='${search}']`)),
      sceneExpect(selector(`[data-endpoint='${search}'][aria-pressed='true']`)).toExist(),
      sceneExpect(selector(`[data-endpoint='${latest}'][aria-pressed='false']`)).toExist(),
    )
  })

  test("picking an endpoint shows its form, and parameterless ones say so", () => {
    scene(
      { update, view },
      given(withPage(Debug.init(true))),
      click(selector(`[data-endpoint='${search}']`)),
      sceneExpect(text("/api/search")).toExist(),
      sceneExpect(label("q")).toExist(),
      sceneExpect(role("button", { name: "Send" })).toBeEnabled(),
      click(selector(`[data-endpoint='${latest}']`)),
      sceneExpect(text("No parameters required.")).toExist(),
      click(selector(`[data-endpoint='${createFolder}']`)),
      sceneExpect(text("Mutation")).toExist(),
      sceneExpect(selector("textarea")).toExist(),
    )
  })

  test("typing then sending shows loading, then the response", () => {
    scene(
      { update, view },
      given(withPage(Debug.init(true))),
      click(selector(`[data-endpoint='${search}']`)),
      type(label("q"), "bleach"),
      click(role("button", { name: "Send" })),
      sceneExpect(role("button", { name: "Sending..." })).toBeDisabled(),
      sceneExpect(text("Loading...")).toExist(),
      Command.resolve(
        Debug.SendRequest,
        Debug.Message.SucceededRequest({
          seq: 2,
          response: { status: 404, contentType: "text/plain", body: "nope" },
        }),
      ),
      sceneExpect(selector("[data-response-status='404']")).toExist(),
      sceneExpect(selector("[data-response-body]")).toContainText("nope"),
      sceneExpect(role("button", { name: "Send" })).toBeEnabled(),
    )
  })

  test("a failure and invalid JSON are shown as alerts", () => {
    scene(
      { update, view },
      given(withPage(Debug.init(true))),
      click(selector(`[data-endpoint='${createFolder}']`)),
      type(selector("textarea"), "{nope"),
      click(role("button", { name: "Send" })),
      sceneExpect(role("alert")).toContainText("Invalid JSON body"),
    )
  })

  test("the push panel follows what the browser allows", () => {
    const status = (value: "Unsupported" | "Denied" | "Default" | "Subscribed") =>
      withPage(
        Debug.update(
          Debug.init(true),
          Debug.Message.GotPushMessage({
            message: Push.Message.CompletedDetectStatus({ status: value }),
          }),
        ).model,
      )
    scene(
      { update, view },
      given(status("Unsupported")),
      sceneExpect(text("Push notifications are not supported in this browser.")).toExist(),
    )
    scene(
      { update, view },
      given(status("Default")),
      sceneExpect(selector("[data-push-status='default']")).toExist(),
      sceneExpect(role("button", { name: "Subscribe" })).toBeEnabled(),
      sceneExpect(role("button", { name: "Send Test Notification" })).toBeAbsent(),
    )
    scene(
      { update, view },
      given(status("Denied")),
      sceneExpect(selector("[data-push-status='denied']")).toExist(),
      sceneExpect(
        text("Permission denied. Enable notifications in your browser settings."),
      ).toExist(),
    )
    scene(
      { update, view },
      given(status("Subscribed")),
      sceneExpect(selector("[data-push-status='subscribed']")).toExist(),
      sceneExpect(role("button", { name: "Unsubscribe" })).toBeEnabled(),
      click(role("button", { name: "Send Test Notification" })),
      Command.resolve(Debug.SendTestNotification, Debug.Message.SucceededTestNotification()),
      sceneExpect(text("Test notification sent")).toExist(),
      Command.resolve(Debug.ClearTestResult, Debug.Message.ClearedTestResult({ seq: 1 })),
      sceneExpect(text("Test notification sent")).toBeAbsent(),
    )
  })
})

describe("wiring", () => {
  const url = (path: string) => Option.getOrThrow(parseUrl(`http://localhost${path}`))

  test("a cold load on /debug checks push support; elsewhere it doesn't", () => {
    expect(init(url("/debug")).commands?.map((c) => c.name)).toContain("DetectPushStatus")
    expect(init(url("/settings")).commands?.map((c) => c.name) ?? []).not.toContain(
      "DetectPushStatus",
    )
  })

  test("entering /debug checks push support", () => {
    const entered = update(modelAt(AppRoute.Prowlarr()), Message.ChangedUrl({ url: url("/debug") }))
    expect(entered.commands?.map((c) => c.name)).toContain("DetectPushStatus")
  })

  test("the app routes its messages to the page", () => {
    const next = update(
      modelAt(AppRoute.Debug()),
      Message.GotDebugMessage({ message: Debug.Message.ClickedEndpoint({ index: latest }) }),
    )
    expect(Option.getOrUndefined(next.model.debug.maybeSelectedIndex)).toBe(latest)
  })
})
