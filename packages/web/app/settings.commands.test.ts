import { Effect, Layer } from "effect"
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http"
import { afterEach, describe, expect, test, vi } from "vitest"

import { ApiClientService } from "./api"
import * as Settings from "./settings"
import { defaultConfig } from "./settingsFixtures"

afterEach(() => {
  vi.restoreAllMocks()
})

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const run = <A>(
  program: Effect.Effect<A, never, ApiClientService>,
  respond: (request: HttpClientRequest.HttpClientRequest) => Response,
  seen: Array<HttpClientRequest.HttpClientRequest> = [],
) => {
  const httpClient = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      seen.push(request)
      return Effect.succeed(HttpClientResponse.fromWeb(request, respond(request)))
    }),
  )
  const layer = ApiClientService.layer("http://api.test").pipe(Layer.provide(httpClient))
  return Effect.runPromise(program.pipe(Effect.provide(layer)))
}

describe("FetchSettings", () => {
  test("success carries the decoded config", async () => {
    const message = await run(Settings.FetchSettings().effect, json(200, {}))
    expect(message).toStrictEqual(
      Settings.Message.SucceededFetchSettings({ config: defaultConfig }),
    )
  })

  test("failure carries the server's message", async () => {
    const message = await run(
      Settings.FetchSettings().effect,
      json(500, { _tag: "ConfigLoadError", message: "db locked" }),
    )
    expect(message).toStrictEqual(Settings.Message.FailedFetchSettings({ reason: "db locked" }))
  })
})

describe("SaveSettings", () => {
  test("POSTs the config and reports success with it", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const message = await run(
      Settings.SaveSettings({ config: defaultConfig }).effect,
      json(200, { success: true }),
      seen,
    )
    expect(message).toStrictEqual(Settings.Message.SucceededSaveSettings({ config: defaultConfig }))
    expect(seen[0]?.method).toBe("POST")
    expect(seen[0]?.url).toBe("http://api.test/api/settings")
  })

  test("a server rejection becomes FailedSaveSettings", async () => {
    const message = await run(
      Settings.SaveSettings({ config: defaultConfig }).effect,
      json(500, { _tag: "ConfigSaveError", message: "read-only fs" }),
    )
    expect(message).toStrictEqual(Settings.Message.FailedSaveSettings({ reason: "read-only fs" }))
  })
})

describe("TestTelegram and libraries", () => {
  test("telegram success / failure", async () => {
    expect(await run(Settings.TestTelegram().effect, json(200, { success: true }))).toStrictEqual(
      Settings.Message.SucceededTestTelegram(),
    )
    const failed = await run(
      Settings.TestTelegram().effect,
      json(503, { _tag: "TelegramNotConfigured", message: "no token" }),
    )
    expect(failed).toStrictEqual(Settings.Message.FailedTestTelegram({ reason: "no token" }))
  })

  test("libraries success / failure", async () => {
    expect(
      await run(Settings.FetchKomgaLibraries().effect, json(200, [{ id: "1", name: "Manga" }])),
    ).toStrictEqual(
      Settings.Message.SucceededFetchLibraries({ libraries: [{ id: "1", name: "Manga" }] }),
    )
    const failed = await run(
      Settings.FetchKomgaLibraries().effect,
      json(503, { _tag: "KomgaNotConfigured", message: "no komga" }),
    )
    expect(failed).toStrictEqual(Settings.Message.FailedFetchLibraries({ reason: "no komga" }))
  })
})

describe("ExportSettings", () => {
  test("downloads the server's config as a file", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const downloads: Array<string> = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download)
    })

    const message = await run(Settings.ExportSettings().effect, json(200, {}))

    expect(message).toStrictEqual(Settings.Message.SucceededExportSettings())
    expect(downloads).toStrictEqual(["inkpipe-settings.json"])
  })

  test("a failed fetch downloads nothing", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
    const message = await run(
      Settings.ExportSettings().effect,
      json(500, { _tag: "ConfigLoadError", message: "nope" }),
    )
    expect(message).toStrictEqual(Settings.Message.FailedExportSettings({ reason: "nope" }))
    expect(click).not.toHaveBeenCalled()
  })
})

describe("importFile", () => {
  const fileOf = (text: string) => new File([text], "settings.json", { type: "application/json" })

  test("sends the parsed JSON to the server", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const message = await run(
      Settings.importFile(fileOf('{"prowlarr":{"url":"http://p"}}')),
      json(200, { success: true }),
      seen,
    )
    expect(message).toStrictEqual(Settings.Message.SucceededImportSettings())
    expect(seen[0]?.url).toBe("http://api.test/api/settings/import")
  })

  test("a file that is not JSON never reaches the server", async () => {
    const seen: Array<HttpClientRequest.HttpClientRequest> = []
    const message = await run(
      Settings.importFile(fileOf("not json")),
      json(200, { success: true }),
      seen,
    )
    expect(message).toStrictEqual(
      Settings.Message.FailedImportSettings({ reason: "The file is not valid JSON" }),
    )
    expect(seen).toHaveLength(0)
  })

  test("the server rejecting the content is reported with its reason", async () => {
    const message = await run(
      Settings.importFile(fileOf("{}")),
      json(422, { _tag: "SettingsImportError", message: "unknown key" }),
    )
    expect(message).toStrictEqual(Settings.Message.FailedImportSettings({ reason: "unknown key" }))
  })
})
