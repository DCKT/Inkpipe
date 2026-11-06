import { Effect, Layer, Option } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { describe, expect, test } from "vitest"

import { ApiClientService } from "./api"
import * as FolderSelect from "./folderSelect"
import { requestJson } from "./testHttp"
import * as Form from "./watchForm"
import { makeWatch, wid } from "./watchFixtures"

const base = Form.init()
const typed = (name = "One Piece", query = "one piece"): Form.Model => ({ ...base, name, query })
const withFolders = (model: Form.Model, folders: ReadonlyArray<string>, input = ""): Form.Model =>
  Form.update(
    Form.update(
      model,
      Form.Message.GotFolderMessage({
        message: FolderSelect.Message.SucceededFetchFolders({ folders }),
      }),
    ).model,
    Form.Message.GotFolderMessage({ message: FolderSelect.Message.ChangedInput({ value: input }) }),
  ).model

describe("parseInterval", () => {
  test.each([
    ["3600", 3600],
    ["300", 300],
    ["299", 300],
    ["1", 300],
    ["", 3600],
    ["abc", 3600],
    ["-5", 3600],
    ["0", 3600],
    [" 7200 ", 7200],
    ["Infinity", 3600],
  ])("%j -> %d", (text, expected) => {
    expect(Form.parseInterval(text)).toBe(expected)
  })
})

describe("buildPayload", () => {
  test("is None while the name or the query is blank", () => {
    expect(Form.buildPayload(typed("", "q"))).toStrictEqual(Option.none())
    expect(Form.buildPayload(typed("n", "   "))).toStrictEqual(Option.none())
  })

  test("trims text, clamps the interval, cleans the filters and sends a null folder when none is chosen", () => {
    const model: Form.Model = {
      ...typed("  Name ", " query "),
      intervalText: "10",
      filterGroups: [
        { mode: "OR", substrings: ["a", " "] },
        { mode: "AND", substrings: [""] },
      ],
    }
    expect(Form.buildPayload(model)).toStrictEqual(
      Option.some({
        name: "Name",
        query: "query",
        intervalSeconds: 300,
        filterGroups: [{ mode: "OR", substrings: ["a"] }],
        subfolder: null,
      }),
    )
  })

  test("an existing folder is sent in its encoded form, a new one as typed", () => {
    const existing = withFolders(typed(), ["My%20Manga"], "my manga")
    expect(Option.map(Form.buildPayload(existing), (p) => p.subfolder)).toStrictEqual(
      Option.some("My%20Manga"),
    )
    const fresh = withFolders(typed(), ["a"], " Fresh ")
    expect(Option.map(Form.buildPayload(fresh), (p) => p.subfolder)).toStrictEqual(
      Option.some("Fresh"),
    )
  })
})

describe("opening", () => {
  test("create opens an empty form and refreshes the folders", () => {
    const opened = Form.openForCreate({
      ...typed("old", "old"),
      filterGroups: [{ mode: "OR", substrings: ["x"] }],
    })
    expect(opened.model.dialog.isOpen).toBe(true)
    expect(opened.model.mode).toStrictEqual(Form.Mode.Create())
    expect(opened.model.name).toBe("")
    expect(opened.model.filterGroups).toStrictEqual([])
    expect(opened.model.intervalText).toBe("3600")
    expect(opened.commands?.map((c) => c.name)).toContain("FetchFolders")
  })

  test("edit fills the form from the watch, including its folder", () => {
    const watch = makeWatch({
      id: 7,
      name: "Berserk",
      query: "berserk",
      intervalSeconds: 600,
      subfolder: "My%20Manga",
    })
    const opened = Form.openForEdit(base, watch)
    expect(opened.model.mode).toStrictEqual(Form.Mode.Edit({ watchId: wid(7) }))
    expect(opened.model.name).toBe("Berserk")
    expect(opened.model.intervalText).toBe("600")
    expect(opened.model.filterGroups).toStrictEqual(watch.filterGroups)
    expect(opened.model.folder.input).toBe("My Manga")
  })

  test("reopening never shows leftovers from a previous save error", () => {
    const failed = Form.update(typed(), Form.Message.FailedSave({ reason: "boom" })).model
    expect(Form.openForCreate(failed).model.maybeError).toStrictEqual(Option.none())
  })
})

describe("editing", () => {
  test("text fields", () => {
    let m = Form.update(base, Form.Message.ChangedName({ value: "N" })).model
    m = Form.update(m, Form.Message.ChangedQuery({ value: "Q" })).model
    m = Form.update(m, Form.Message.ChangedInterval({ value: "900" })).model
    expect([m.name, m.query, m.intervalText]).toStrictEqual(["N", "Q", "900"])
  })

  test("filter group messages edit the right group", () => {
    let m = Form.update(base, Form.Message.ClickedAddGroup()).model
    m = Form.update(m, Form.Message.ClickedAddGroup()).model
    m = Form.update(
      m,
      Form.Message.ChangedSubstring({ groupIndex: 1, substringIndex: 0, value: "x" }),
    ).model
    m = Form.update(m, Form.Message.ClickedAddSubstring({ groupIndex: 1 })).model
    m = Form.update(m, Form.Message.ChangedGroupMode({ groupIndex: 1, mode: "OR" })).model
    expect(m.filterGroups).toStrictEqual([
      { mode: "AND", substrings: [""] },
      { mode: "OR", substrings: ["x", ""] },
    ])
    m = Form.update(
      m,
      Form.Message.ClickedRemoveSubstring({ groupIndex: 1, substringIndex: 1 }),
    ).model
    m = Form.update(m, Form.Message.ClickedRemoveGroup({ groupIndex: 0 })).model
    expect(m.filterGroups).toStrictEqual([{ mode: "OR", substrings: ["x"] }])
  })
})

describe("saving", () => {
  test("Save is held while name or query is blank, while saving, and while a typed folder is being checked", () => {
    expect(Form.canSave(typed("", ""))).toBe(false)
    expect(Form.canSave(typed())).toBe(true)
    expect(Form.canSave({ ...typed(), isSaving: true })).toBe(false)
    const checking = Form.update(
      Form.openForCreate({ ...typed(), name: "n", query: "q" }).model,
      Form.Message.GotFolderMessage({
        message: FolderSelect.Message.ChangedInput({ value: "manga" }),
      }),
    ).model
    expect(Form.isFolderUnsettled({ ...checking, name: "n", query: "q" })).toBe(true)
    expect(Form.canSave({ ...checking, name: "n", query: "q" })).toBe(false)
  })

  test("creating sends CreateWatch once", () => {
    const first = Form.update(typed(), Form.Message.ClickedSave())
    expect(first.model.isSaving).toBe(true)
    expect(first.commands?.map((c) => c.name)).toStrictEqual(["CreateWatch"])
    expect(Form.update(first.model, Form.Message.ClickedSave()).commands ?? []).toHaveLength(0)
  })

  test("editing sends UpdateWatch for that watch", () => {
    const opened = Form.openForEdit(base, makeWatch({ id: 7 })).model
    const saved = Form.update(opened, Form.Message.ClickedSave())
    expect(saved.commands?.[0]?.name).toBe("UpdateWatch")
    expect(saved.commands?.[0]?.args).toMatchObject({ watchId: wid(7) })
  })

  test("with a blank name nothing is sent", () => {
    expect(Form.update(typed("", "q"), Form.Message.ClickedSave()).commands ?? []).toHaveLength(0)
  })

  test("success closes the dialog, unlocks Save and reports which mode was saved", () => {
    const opened = Form.openForEdit(base, makeWatch({ id: 7 })).model
    const done = Form.update({ ...opened, isSaving: true }, Form.Message.SucceededSave())
    expect(done.model.isSaving).toBe(false)
    expect(done.commands?.map((c) => c.name)).toContain("CloseDialog")
    expect(done.outMessage).toStrictEqual(
      Form.OutMessage.SavedWatch({ mode: Form.Mode.Edit({ watchId: wid(7) }) }),
    )
  })

  test("failure stays open, unlocks Save and shows the reason", () => {
    const failed = Form.update(
      { ...typed(), isSaving: true },
      Form.Message.FailedSave({ reason: "name taken" }),
    )
    expect(failed.model.isSaving).toBe(false)
    expect(failed.model.maybeError).toStrictEqual(Option.some("name taken"))
    expect(failed.outMessage).toBeUndefined()
  })

  test("the next save clears the previous error", () => {
    const failed = Form.update(typed(), Form.Message.FailedSave({ reason: "x" })).model
    expect(Form.update(failed, Form.Message.ClickedSave()).model.maybeError).toStrictEqual(
      Option.none(),
    )
  })
})

describe("Commands (against a stubbed API)", () => {
  const run = <A>(
    program: Effect.Effect<A, never, ApiClientService>,
    respond: () => Response,
    seen: Array<HttpClientRequest.HttpClientRequest> = [],
  ) => {
    const httpClient = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) => {
        seen.push(request)
        return Effect.succeed(HttpClientResponse.fromWeb(request, respond()))
      }),
    )
    const layer = ApiClientService.layer("http://api.test").pipe(Layer.provide(httpClient))
    return Effect.runPromise(program.pipe(Effect.provide(layer)))
  }
  const json = (status: number, body: unknown) => () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  const payload = {
    name: "n",
    query: "q",
    intervalSeconds: 600,
    filterGroups: [{ mode: "AND" as const, substrings: ["a"] }],
    subfolder: null,
  }

  test("create posts the payload to /api/watches", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const message = await run(Form.CreateWatch({ payload }).effect, json(201, makeWatch()), seen)
    expect(message).toStrictEqual(Form.Message.SucceededSave())
    expect(seen[0]?.method).toBe("POST")
    expect(seen[0]?.url).toBe("http://api.test/api/watches")
    expect(requestJson(seen[0])).toMatchObject({ name: "n", intervalSeconds: 600, subfolder: null })
  })

  test("update puts to /api/watches/:id", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    await run(
      Form.UpdateWatch({ watchId: wid(7), payload }).effect,
      json(200, makeWatch({ id: 7 })),
      seen,
    )
    expect(seen[0]?.method).toBe("PUT")
    expect(seen[0]?.url).toBe("http://api.test/api/watches/7")
  })

  test("a validation error becomes FailedSave with the server's message", async () => {
    const message = await run(
      Form.CreateWatch({ payload }).effect,
      json(422, { _tag: "ValidationError", message: "Interval too small" }),
    )
    expect(message).toStrictEqual(Form.Message.FailedSave({ reason: "Interval too small" }))
  })
})
