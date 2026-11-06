import { Effect, Layer, Option } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import { AsyncData } from "foldkit"
import { type HtmlBuilder, type Html } from "foldkit/html"
import { expect as sceneExpect, given, label, scene, selector, text, type } from "foldkit/scene"
import { describe, expect, test } from "vitest"

import { ApiClientService } from "./api"
import * as Folders from "./folderSelect"

const loaded = (folders: ReadonlyArray<string>, input = ""): Folders.Model => ({
  ...Folders.update(Folders.init().model, Folders.Message.SucceededFetchFolders({ folders })).model,
  input,
})

describe("safeDecode", () => {
  test("decodes URI-encoded names", () => {
    expect(Folders.safeDecode("My%20Manga")).toBe("My Manga")
    expect(Folders.safeDecode("caf%C3%A9")).toBe("café")
  })

  test("returns anything undecodable as it was typed", () => {
    expect(Folders.safeDecode("100%")).toBe("100%")
    expect(Folders.safeDecode("%E0%A4%A")).toBe("%E0%A4%A")
    expect(Folders.safeDecode("")).toBe("")
  })
})

describe("findExisting", () => {
  const folders = ["My%20Manga", "action", "caf%C3%A9"]

  test("matches the decoded name, ignoring case and outer spaces, and returns the encoded original", () => {
    expect(Folders.findExisting(folders, "my manga")).toStrictEqual(Option.some("My%20Manga"))
    expect(Folders.findExisting(folders, "  ACTION ")).toStrictEqual(Option.some("action"))
    expect(Folders.findExisting(folders, "café")).toStrictEqual(Option.some("caf%C3%A9"))
  })

  test("an exact-case match wins over a case-insensitive one", () => {
    const both = ["Manga", "manga"]
    expect(Folders.findExisting(both, "manga")).toStrictEqual(Option.some("manga"))
    expect(Folders.findExisting(both, "Manga")).toStrictEqual(Option.some("Manga"))
    expect(Folders.findExisting(both, "MANGA")).toStrictEqual(Option.some("Manga"))
  })

  test("outer slashes don't make a folder look new", () => {
    expect(Folders.findExisting(["manga"], "manga/")).toStrictEqual(Option.some("manga"))
    expect(Folders.findExisting(["manga"], "/manga")).toStrictEqual(Option.some("manga"))
  })

  test("the same text in different unicode forms matches", () => {
    const decomposed = "cafe\u0301"
    expect(Folders.findExisting([encodeURIComponent(decomposed)], "caf\u00e9")).toStrictEqual(
      Option.some(encodeURIComponent(decomposed)),
    )
  })

  test("is none for names that don't exist", () => {
    expect(Folders.findExisting(folders, "manga")).toStrictEqual(Option.none())
    expect(Folders.findExisting([], "anything")).toStrictEqual(Option.none())
  })
})

describe("selection", () => {
  test("nothing typed means no folder", () => {
    expect(Folders.selection(loaded(["a"], ""))).toStrictEqual(Option.none())
    expect(Folders.selection(loaded(["a"], "   "))).toStrictEqual(Option.none())
  })

  test("an existing folder is sent in its encoded form and is not new", () => {
    expect(Folders.selection(loaded(["My%20Manga"], "My Manga"))).toStrictEqual(
      Option.some({ subfolder: "My%20Manga", isNewFolder: false }),
    )
  })

  test("outer slashes are dropped from what is sent", () => {
    expect(Folders.selection(loaded(["a"], "/fresh/"))).toStrictEqual(
      Option.some({ subfolder: "fresh", isNewFolder: true }),
    )
  })

  test("the list is only 'known' once it has loaded", () => {
    expect(Folders.isListKnown(Folders.init().model)).toBe(false)
    expect(Folders.isListKnown(loaded([]))).toBe(true)
    expect(Folders.isListKnown(Folders.refresh(loaded(["a"])).model)).toBe(true)
  })

  test("an unknown name is sent trimmed and flagged as new", () => {
    expect(Folders.selection(loaded(["a"], "  fresh one "))).toStrictEqual(
      Option.some({ subfolder: "fresh one", isNewFolder: true }),
    )
  })

  test("before folders have loaded, a typed name counts as new", () => {
    expect(Folders.selection({ ...Folders.init().model, input: "x" })).toStrictEqual(
      Option.some({ subfolder: "x", isNewFolder: true }),
    )
  })
})

describe("safe requests", () => {
  test("a request names 'new' only when the existing folders are known", () => {
    const known = loaded(["manga"], "fresh")
    expect(Folders.requestFor(known)).toStrictEqual(
      Option.some({ subfolder: "fresh", newFolder: Option.some(true) }),
    )
    expect(Folders.requestFor(loaded(["manga"], "manga"))).toStrictEqual(
      Option.some({ subfolder: "manga", newFolder: Option.some(false) }),
    )
    const unknown = { ...Folders.init().model, input: "manga" }
    expect(Folders.requestFor(unknown)).toStrictEqual(
      Option.some({ subfolder: "manga", newFolder: Option.none() }),
    )
    expect(Folders.requestFor(loaded(["manga"], ""))).toStrictEqual(Option.none())
  })

  test("clearInput empties the text and keeps the folders", () => {
    const cleared = Folders.clearInput(loaded(["manga"], "typed"))
    expect(cleared.input).toBe("")
    expect(AsyncData.getData(cleared.folders)).toStrictEqual(Option.some(["manga"]))
  })

  test("isPending is true only while a fetch is in flight", () => {
    expect(Folders.isPending(Folders.init().model)).toBe(true)
    expect(Folders.isPending(Folders.initial())).toBe(false)
    expect(Folders.isPending(loaded(["a"]))).toBe(false)
    expect(Folders.isPending(Folders.refresh(loaded(["a"])).model)).toBe(true)
  })
})

describe("update", () => {
  test("init fetches once and decodes the pre-filled value", () => {
    const started = Folders.init("My%20Manga")
    expect(started.model.input).toBe("My Manga")
    expect(AsyncData.isLoading(started.model.folders)).toBe(true)
    expect(started.commands?.map((c) => c.name)).toStrictEqual(["FetchFolders"])
  })

  test("initial() fetches nothing and leaves loading to refresh", () => {
    const idle = Folders.initial("My%20Manga")
    expect(AsyncData.isIdle(idle.folders)).toBe(true)
    expect(idle.input).toBe("My Manga")
    const refreshed = Folders.refresh(idle)
    expect(AsyncData.isLoading(refreshed.model.folders)).toBe(true)
    expect(refreshed.commands?.map((c) => c.name)).toStrictEqual(["FetchFolders"])
  })

  test("typing changes only the input", () => {
    const model = loaded(["a"])
    const next = Folders.update(model, Folders.Message.ChangedInput({ value: "ab" })).model
    expect(next.input).toBe("ab")
    expect(next.folders).toStrictEqual(model.folders)
  })

  test("a refresh while one is already running sends no second fetch", () => {
    const first = Folders.refresh(loaded(["a"]))
    expect(Folders.refresh(first.model).commands ?? []).toHaveLength(0)
    expect(Folders.refresh(Folders.init().model).commands ?? []).toHaveLength(0)
  })

  test("a failed refresh settles to stale data instead of staying in flight", () => {
    const failed = Folders.update(
      Folders.refresh(loaded(["a"])).model,
      Folders.Message.FailedFetchFolders({ reason: "x" }),
    ).model
    expect(AsyncData.isStale(failed.folders)).toBe(true)
    expect(AsyncData.isPending(failed.folders)).toBe(false)
    expect(AsyncData.getData(failed.folders)).toStrictEqual(Option.some(["a"]))
  })

  test("refresh re-fetches but keeps showing the known folders", () => {
    const refreshed = Folders.refresh(loaded(["a", "b"]))
    expect(refreshed.commands?.map((c) => c.name)).toStrictEqual(["FetchFolders"])
    expect(AsyncData.getData(refreshed.model.folders)).toStrictEqual(Option.some(["a", "b"]))
    expect(AsyncData.isRefreshing(refreshed.model.folders)).toBe(true)
  })

  test("a failed first load is a failure, but a failed refresh keeps the known folders", () => {
    const failedFirst = Folders.update(
      Folders.init().model,
      Folders.Message.FailedFetchFolders({ reason: "x" }),
    ).model
    expect(AsyncData.isFailure(failedFirst.folders)).toBe(true)
    const failedRefresh = Folders.update(
      Folders.refresh(loaded(["a"])).model,
      Folders.Message.FailedFetchFolders({ reason: "x" }),
    ).model
    expect(AsyncData.getData(failedRefresh.folders)).toStrictEqual(Option.some(["a"]))
  })

  test("setValue replaces the text, decoded", () => {
    expect(Folders.setValue(loaded(["a"], "old"), "New%20One").input).toBe("New One")
  })
})

describe("FetchFolders (against a stubbed API)", () => {
  const run = (body: unknown, status = 200) => {
    const httpClient = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify(body), {
              status,
              headers: { "content-type": "application/json" },
            }),
          ),
        ),
      ),
    )
    const layer = ApiClientService.layer("http://api.test").pipe(Layer.provide(httpClient))
    return Effect.runPromise(Folders.FetchFolders().effect.pipe(Effect.provide(layer)))
  }

  test("success carries the folders", async () => {
    expect(await run({ folders: ["a", "b"] })).toStrictEqual(
      Folders.Message.SucceededFetchFolders({ folders: ["a", "b"] }),
    )
  })

  test("failure carries the server's message", async () => {
    expect(
      await run({ _tag: "CopypartyNotConfigured", message: "Copyparty is not configured" }, 503),
    ).toStrictEqual(Folders.Message.FailedFetchFolders({ reason: "Copyparty is not configured" }))
  })
})

const harness = {
  update: (model: Folders.Model, message: Folders.Message) => ({
    model: Folders.update(model, message).model,
  }),
  view: (model: Folders.Model, h: HtmlBuilder<Folders.Message>): Html =>
    h.submodel({
      slotId: "folders",
      model,
      view: Folders.view,
      viewInputs: {
        idPrefix: "dl",
        label: "Subfolder",
        placeholder: "e.g. manga/action or leave empty",
      },
      toParentMessage: (message) => message,
    }),
}

describe("view", () => {
  test("labels the input and offers existing folders, decoded", () => {
    scene(
      harness,
      given(loaded(["My%20Manga", "action"])),
      sceneExpect(label("Subfolder (optional)")).toHaveAttr("list", "dl-suggestions"),
      sceneExpect(selector("datalist#dl-suggestions option[value='My Manga']")).toExist(),
      sceneExpect(selector("datalist#dl-suggestions option[value='action']")).toExist(),
    )
  })

  test("says a new folder will be created, but not for an existing one", () => {
    scene(
      harness,
      given(loaded(["action"])),
      sceneExpect(text('"fresh" will be created.')).toBeAbsent(),
      type(label("Subfolder (optional)"), "fresh"),
      sceneExpect(text('"fresh" will be created.')).toExist(),
      type(label("Subfolder (optional)"), "action"),
      sceneExpect(text('"action" will be created.')).toBeAbsent(),
    )
  })

  test("ids follow idPrefix, so two pickers on a page don't collide", () => {
    const other = {
      ...harness,
      view: (model: Folders.Model, h: HtmlBuilder<Folders.Message>): Html =>
        h.submodel({
          slotId: "folders",
          model,
          view: Folders.view,
          viewInputs: { idPrefix: "watch", label: "Subfolder", placeholder: "p" },
          toParentMessage: (message) => message,
        }),
    }
    scene(
      other,
      given(loaded(["a"])),
      sceneExpect(selector("input#watch-input")).toHaveAttr("list", "watch-suggestions"),
      sceneExpect(selector("datalist#watch-suggestions")).toExist(),
      sceneExpect(selector("datalist#dl-suggestions")).toBeAbsent(),
    )
  })

  test("the creation note names the trimmed folder", () => {
    scene(
      harness,
      given(loaded(["a"], "  fresh ")),
      sceneExpect(text('"fresh" will be created.')).toExist(),
    )
  })

  test("before the list is known it only says the folder may be created", () => {
    scene(
      harness,
      given({ ...Folders.init().model, input: "manga" }),
      sceneExpect(text('"manga" will be created if it doesn\'t already exist.')).toExist(),
      sceneExpect(text('"manga" will be created.')).toBeAbsent(),
    )
  })

  test("the status region is always mounted and tied to the input", () => {
    scene(
      harness,
      given(loaded(["a"])),
      sceneExpect(selector("[role='status']#dl-input-description")).toExist(),
      sceneExpect(selector("input#dl-input")).toHaveAttr(
        "aria-describedby",
        "dl-input-description",
      ),
    )
  })

  test("a refresh in flight shows the known folders without a loading message", () => {
    scene(
      harness,
      given(Folders.refresh(loaded(["My%20Manga"])).model),
      sceneExpect(text("Loading existing folders…")).toBeAbsent(),
      sceneExpect(selector("datalist option[value='My Manga']")).toExist(),
    )
  })

  test("explains loading, empty and failed lists", () => {
    scene(
      harness,
      given(Folders.init().model),
      sceneExpect(text("Loading existing folders…")).toExist(),
    )
    scene(
      harness,
      given(loaded([])),
      sceneExpect(text("No existing subfolders — type a new name to create one.")).toExist(),
    )
    scene(
      harness,
      given(
        Folders.update(Folders.init().model, Folders.Message.FailedFetchFolders({ reason: "x" }))
          .model,
      ),
      sceneExpect(text("Couldn't load existing folders — you can still type a name.")).toExist(),
    )
  })
})
