import { Effect, Layer } from "effect"
import { describe, it, expect, vi, beforeEach, afterEach } from "@effect/vitest"
import type { AppConfig, Watch, WatchAlert } from "@inkpipe/shared"
import { WatchId, WatchAlertId } from "@inkpipe/shared"
import {
  TelegramCallbackListenerService,
  TelegramCallbackListenerServiceLive,
  parseWatchCallback,
} from "./TelegramCallbackListener"
import { ConfigService } from "../core/Config"
import { TelegramService, type TelegramUpdate } from "../integrations/Telegram"
import { WatchStoreService } from "../storage/WatchStore"
import { PipelineService } from "./Pipeline"
import { AllDebridService } from "../integrations/AllDebrid"
import { LogServiceLive } from "../core/Log"

const now = new Date().toISOString()

const testConfig: AppConfig = {
  prowlarr: { url: "", apiKey: "" },
  alldebrid: { apiKey: "" },
  kcc: {
    dockerImage: "ghcr.io/ciromattia/kcc:latest", profile: "KoBO", format: "Auto",
    mangaStyle: false, webtoon: false, twoPanel: false,
    upscale: true, stretch: false, hq: false, gamma: 1.0,
    cropping: "1", croppingPower: 1.0, forceColor: true,
    forcePng: false, noAutoContrast: false, blackBorders: false,
    whiteBorders: false, splitter: "0", noProcessing: false,
    eraseRainbow: true, coverFill: false, batchSplit: "0",
    targetSize: 0, customWidth: 0, customHeight: 0, noKepub: false,
  },
  copyparty: { url: "", uploadPath: "/", password: "" },
  komga: { url: "", apiKey: "", defaultLibraryId: "" },
  annasArchive: { apiKey: "", baseUrl: "https://annas-archive.org" },
  telegram: { botToken: "test-token", chatId: "12345" },
  general: { publicUrl: "" },
}

const testWatch: Watch = {
  id: WatchId.make(3),
  name: "One Piece",
  enabled: true,
  query: "one piece",
  intervalSeconds: 600,
  filterGroups: [],
  subfolder: null,
  createdAt: now,
  updatedAt: now,
}

const testAlert: WatchAlert = {
  id: WatchAlertId.make(7),
  watchId: WatchId.make(3),
  guid: "g1",
  title: "One Piece v01",
  magnetUrl: "magnet:?xt=urn:btih:abc",
  downloadUrl: null,
  size: 100,
  seeders: 5,
  indexer: "Nyaa",
  matchedAt: 0,
  acknowledged: false,
}

function makeCallbackUpdate(
  overrides: Partial<NonNullable<TelegramUpdate["callback_query"]>> = {},
  updateId = 1,
): TelegramUpdate {
  return {
    update_id: updateId,
    callback_query: {
      id: "cb1",
      data: `dl:${testAlert.watchId}:${testAlert.id}`,
      from: { id: 999 },
      message: { message_id: 42, chat: { id: 12345 } },
      ...overrides,
    },
  }
}

interface Deps {
  config?: Partial<AppConfig>
  getUpdatesImpl?: (offset: number, timeoutSeconds: number) => Effect.Effect<TelegramUpdate[], never>
  getAlertImpl?: () => Effect.Effect<WatchAlert, any>
  getWatchImpl?: () => Effect.Effect<Watch, any>
  runPipelineSpy?: ReturnType<typeof vi.fn>
  uploadMagnetSpy?: ReturnType<typeof vi.fn>
  acknowledgeAlertSpy?: ReturnType<typeof vi.fn>
  updateWatchSpy?: ReturnType<typeof vi.fn>
  answerCallbackQuerySpy?: ReturnType<typeof vi.fn>
  editMessageTextSpy?: ReturnType<typeof vi.fn>
  sendMessageSpy?: ReturnType<typeof vi.fn>
}

// Mirrors the real `getUpdates` long-poll: yields one batch on the first
// call, then hangs (as a real 25s long poll would) so the listener's loop
// blocks on the second iteration instead of spinning — tests race `run`
// against a short `Effect.sleep` and assert on what happened by then.
function makeGetUpdates(update: TelegramUpdate) {
  let calls = 0
  return () => {
    calls++
    return calls === 1 ? Effect.succeed([update]) : Effect.never
  }
}

function makeLayer(deps: Deps = {}) {
  const runPipelineSpy = deps.runPipelineSpy ?? vi.fn((..._args: unknown[]) => Effect.void)
  const uploadMagnetSpy = deps.uploadMagnetSpy ?? vi.fn((_magnetOrUrl: string) => Effect.succeed({ id: 1, ready: true }))
  const acknowledgeAlertSpy = deps.acknowledgeAlertSpy ?? vi.fn(() => Effect.void)
  const updateWatchSpy = deps.updateWatchSpy ?? vi.fn(() => Effect.succeed(testWatch))
  const answerCallbackQuerySpy = deps.answerCallbackQuerySpy ?? vi.fn(() => Effect.void)
  const editMessageTextSpy = deps.editMessageTextSpy ?? vi.fn(() => Effect.void)
  const sendMessageSpy = deps.sendMessageSpy ?? vi.fn((_payload: { text: string }) => Effect.succeed({ messageId: 1 }))

  return Layer.mergeAll(
    LogServiceLive,
    Layer.succeed(ConfigService, {
      loadConfig: Effect.succeed({ ...testConfig, ...deps.config }),
      saveConfig: () => Effect.void,
    }),
    Layer.succeed(TelegramService, {
      sendMessage: sendMessageSpy,
      getUpdates: deps.getUpdatesImpl ?? makeGetUpdates(makeCallbackUpdate()),
      answerCallbackQuery: answerCallbackQuerySpy,
      editMessageText: editMessageTextSpy,
    } as any),
    Layer.succeed(WatchStoreService, {
      getAlert: deps.getAlertImpl ?? (() => Effect.succeed(testAlert)),
      getWatch: deps.getWatchImpl ?? (() => Effect.succeed(testWatch)),
      acknowledgeAlert: acknowledgeAlertSpy,
      updateWatch: updateWatchSpy,
    } as any),
    Layer.succeed(PipelineService, {
      runPipeline: runPipelineSpy,
    } as any),
    Layer.succeed(AllDebridService, {
      uploadMagnet: uploadMagnetSpy,
    } as any),
  )
}

// Real wall-clock delay (not `Effect.sleep`, which `it.effect`'s TestClock
// leaves virtual and never auto-advances) so the race below actually
// resolves and interrupts the still-polling `run` fiber.
const realDelay = (millis: number) =>
  Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, millis)))

function runFor(deps: Deps, millis = 100) {
  const TestLayer = Layer.provide(TelegramCallbackListenerServiceLive, makeLayer(deps))
  return Effect.gen(function* () {
    const svc = yield* TelegramCallbackListenerService
    yield* Effect.race(svc.run, realDelay(millis))
  }).pipe(Effect.provide(TestLayer))
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("parseWatchCallback", () => {
  it("parses a well-formed download callback", () => {
    const parsed = parseWatchCallback("dl:3:7")
    expect(parsed).toEqual({ action: "download", watchId: WatchId.make(3), alertId: WatchAlertId.make(7) })
  })

  it("parses a well-formed save-magnet callback", () => {
    const parsed = parseWatchCallback("sm:3:7")
    expect(parsed).toEqual({ action: "saveMagnet", watchId: WatchId.make(3), alertId: WatchAlertId.make(7) })
  })

  it("returns undefined for an unrecognized prefix", () => {
    expect(parseWatchCallback("other:3:7")).toBeUndefined()
  })

  it("returns undefined for non-numeric ids", () => {
    expect(parseWatchCallback("dl:abc:7")).toBeUndefined()
    expect(parseWatchCallback("sm:3:abc")).toBeUndefined()
  })

  it("returns undefined for empty or non-integer-looking segments", () => {
    expect(parseWatchCallback("dl::")).toBeUndefined()
    expect(parseWatchCallback("dl:3:")).toBeUndefined()
    expect(parseWatchCallback("sm:1e3:7")).toBeUndefined()
    expect(parseWatchCallback("sm:-1:7")).toBeUndefined()
    expect(parseWatchCallback("dl:3.5:7")).toBeUndefined()
  })
})

describe("TelegramCallbackListenerService", () => {
  describe("download action (dl:)", () => {
    it.effect("triggers the pipeline (with no subfolder) and acknowledges the alert for a non-book watch", () =>
      Effect.gen(function* () {
        const runPipelineSpy = vi.fn((..._args: unknown[]) => Effect.void)
        const acknowledgeAlertSpy = vi.fn(() => Effect.void)
        const answerCallbackQuerySpy = vi.fn(() => Effect.void)

        yield* runFor({ runPipelineSpy, acknowledgeAlertSpy, answerCallbackQuerySpy })

        expect(runPipelineSpy).toHaveBeenCalledTimes(1)
        const [result, subfolder, createdFolder] = runPipelineSpy.mock.calls[0]
        expect(result).toMatchObject({ title: testAlert.title, magnetUrl: testAlert.magnetUrl })
        expect(subfolder).toBeUndefined()
        expect(createdFolder).toBe(false)
        expect(acknowledgeAlertSpy).toHaveBeenCalledWith(testAlert.watchId, testAlert.id)
        expect(answerCallbackQuerySpy).toHaveBeenCalledWith("cb1", "Download request sent")
      }))

    it.effect("acknowledges and answers immediately without waiting for the pipeline to finish", () =>
      Effect.gen(function* () {
        // A never-resolving pipeline stands in for a long-running download;
        // if the handler awaited it directly, this test would hang until
        // the outer race times out and the acknowledge/answer assertions
        // below would never be reached.
        const runPipelineSpy = vi.fn((..._args: unknown[]) => Effect.never)
        const acknowledgeAlertSpy = vi.fn(() => Effect.void)
        const answerCallbackQuerySpy = vi.fn(() => Effect.void)

        yield* runFor({ runPipelineSpy, acknowledgeAlertSpy, answerCallbackQuerySpy })

        expect(runPipelineSpy).toHaveBeenCalledTimes(1)
        expect(acknowledgeAlertSpy).toHaveBeenCalledWith(testAlert.watchId, testAlert.id)
        expect(answerCallbackQuerySpy).toHaveBeenCalledWith("cb1", "Download request sent")
      }))

    it.effect("sends a follow-up message once the backgrounded pipeline succeeds", () =>
      Effect.gen(function* () {
        const runPipelineSpy = vi.fn((..._args: unknown[]) => Effect.void)
        const sendMessageSpy = vi.fn((_payload: { text: string }) => Effect.succeed({ messageId: 2 }))

        yield* runFor({ runPipelineSpy, sendMessageSpy })

        expect(sendMessageSpy).toHaveBeenCalledWith({
          text: `✅ Download complete: ${testAlert.title}`,
        })
      }))

    it.effect("sends a follow-up message with the error when the backgrounded pipeline fails", () =>
      Effect.gen(function* () {
        const runPipelineSpy = vi.fn((..._args: unknown[]) => Effect.fail(new Error("AllDebrid timed out") as any))
        const sendMessageSpy = vi.fn((_payload: { text: string }) => Effect.succeed({ messageId: 2 }))

        yield* runFor({ runPipelineSpy, sendMessageSpy })

        expect(sendMessageSpy).toHaveBeenCalledWith({
          text: `❌ Download failed: ${testAlert.title}\nAllDebrid timed out`,
        })
      }))

    it.effect("passes the watch's current subfolder into the pipeline for a book watch", () =>
      Effect.gen(function* () {
        const runPipelineSpy = vi.fn((..._args: unknown[]) => Effect.void)
        const bookWatch: Watch = { ...testWatch, subfolder: "manga/one-piece" }

        yield* runFor({ runPipelineSpy, getWatchImpl: () => Effect.succeed(bookWatch) })

        const [, subfolder, createdFolder] = runPipelineSpy.mock.calls[0]
        expect(subfolder).toBe("manga/one-piece")
        expect(createdFolder).toBe(false)
      }))

    it.effect("does not re-trigger the pipeline for an already-acknowledged alert", () =>
      Effect.gen(function* () {
        const runPipelineSpy = vi.fn(() => Effect.void)
        const answerCallbackQuerySpy = vi.fn(() => Effect.void)

        yield* runFor({
          runPipelineSpy,
          answerCallbackQuerySpy,
          getAlertImpl: () => Effect.succeed({ ...testAlert, acknowledged: true }),
        })

        expect(runPipelineSpy).not.toHaveBeenCalled()
        expect(answerCallbackQuerySpy).toHaveBeenCalledWith("cb1", "Already downloaded")
      }))
  })

  describe("save-magnet action (sm:)", () => {
    it.effect("uploads the magnet and acknowledges the alert, without touching the pipeline", () =>
      Effect.gen(function* () {
        const runPipelineSpy = vi.fn(() => Effect.void)
        const uploadMagnetSpy = vi.fn((_magnetOrUrl: string) => Effect.succeed({ id: 1, ready: true }))
        const acknowledgeAlertSpy = vi.fn(() => Effect.void)
        const answerCallbackQuerySpy = vi.fn(() => Effect.void)

        yield* runFor({
          runPipelineSpy,
          uploadMagnetSpy,
          acknowledgeAlertSpy,
          answerCallbackQuerySpy,
          getUpdatesImpl: makeGetUpdates(
            makeCallbackUpdate({ data: `sm:${testAlert.watchId}:${testAlert.id}` }),
          ),
        })

        expect(uploadMagnetSpy).toHaveBeenCalledWith(testAlert.magnetUrl)
        expect(runPipelineSpy).not.toHaveBeenCalled()
        expect(acknowledgeAlertSpy).toHaveBeenCalledWith(testAlert.watchId, testAlert.id)
        expect(answerCallbackQuerySpy).toHaveBeenCalledWith("cb1", "Saved to magnet")
      }))

    it.effect("does not re-upload for an already-acknowledged alert", () =>
      Effect.gen(function* () {
        const uploadMagnetSpy = vi.fn((_magnetOrUrl: string) => Effect.succeed({ id: 1, ready: true }))
        const answerCallbackQuerySpy = vi.fn(() => Effect.void)

        yield* runFor({
          uploadMagnetSpy,
          answerCallbackQuerySpy,
          getAlertImpl: () => Effect.succeed({ ...testAlert, acknowledged: true }),
          getUpdatesImpl: makeGetUpdates(
            makeCallbackUpdate({ data: `sm:${testAlert.watchId}:${testAlert.id}` }),
          ),
        })

        expect(uploadMagnetSpy).not.toHaveBeenCalled()
        expect(answerCallbackQuerySpy).toHaveBeenCalledWith("cb1", "Already saved")
      }))

    it.effect("answers with an error and does not acknowledge when the alert has neither a magnet nor a download URL", () =>
      Effect.gen(function* () {
        const uploadMagnetSpy = vi.fn((_magnetOrUrl: string) => Effect.succeed({ id: 1, ready: true }))
        const acknowledgeAlertSpy = vi.fn(() => Effect.void)
        const answerCallbackQuerySpy = vi.fn(() => Effect.void)

        yield* runFor({
          uploadMagnetSpy,
          acknowledgeAlertSpy,
          answerCallbackQuerySpy,
          getAlertImpl: () => Effect.succeed({ ...testAlert, magnetUrl: null, downloadUrl: null }),
          getUpdatesImpl: makeGetUpdates(
            makeCallbackUpdate({ data: `sm:${testAlert.watchId}:${testAlert.id}` }),
          ),
        })

        expect(uploadMagnetSpy).not.toHaveBeenCalled()
        expect(acknowledgeAlertSpy).not.toHaveBeenCalled()
        expect(answerCallbackQuerySpy).toHaveBeenCalledWith("cb1", "No magnet or download URL for this alert")
      }))

    it.effect("falls back to the alert's downloadUrl when there is no magnetUrl", () =>
      Effect.gen(function* () {
        const uploadMagnetSpy = vi.fn((_magnetOrUrl: string) => Effect.succeed({ id: 1, ready: true }))
        const acknowledgeAlertSpy = vi.fn(() => Effect.void)

        yield* runFor({
          uploadMagnetSpy,
          acknowledgeAlertSpy,
          getAlertImpl: () =>
            Effect.succeed({
              ...testAlert,
              magnetUrl: null,
              downloadUrl: "https://indexer.example.com/download/abc.torrent",
            }),
          getUpdatesImpl: makeGetUpdates(
            makeCallbackUpdate({ data: `sm:${testAlert.watchId}:${testAlert.id}` }),
          ),
        })

        expect(uploadMagnetSpy).toHaveBeenCalledWith("https://indexer.example.com/download/abc.torrent")
        expect(acknowledgeAlertSpy).toHaveBeenCalledWith(testAlert.watchId, testAlert.id)
      }))
  })

  it.effect("ignores a callback from a chat other than the configured one", () =>
    Effect.gen(function* () {
      const runPipelineSpy = vi.fn(() => Effect.void)
      const answerCallbackQuerySpy = vi.fn(() => Effect.void)

      yield* runFor({
        runPipelineSpy,
        answerCallbackQuerySpy,
        getUpdatesImpl: makeGetUpdates(
          makeCallbackUpdate({ message: { message_id: 42, chat: { id: 99999 } } }),
        ),
      })

      expect(runPipelineSpy).not.toHaveBeenCalled()
      expect(answerCallbackQuerySpy).not.toHaveBeenCalled()
    }))

  it.effect("ignores an update with no callback_query", () =>
    Effect.gen(function* () {
      const runPipelineSpy = vi.fn(() => Effect.void)

      yield* runFor({
        runPipelineSpy,
        // Same "one batch, then hang" shape as `makeGetUpdates` elsewhere —
        // a plain `() => Effect.succeed([...])` would return instantly on
        // every call and spin a hot poll loop for the whole race window,
        // starving other tests under parallel load.
        getUpdatesImpl: makeGetUpdates({ update_id: 1 }),
      })

      expect(runPipelineSpy).not.toHaveBeenCalled()
    }))

  it.effect("ignores a callback whose data does not match a known prefix", () =>
    Effect.gen(function* () {
      const getAlertImpl = vi.fn(() => Effect.succeed(testAlert))
      const runPipelineSpy = vi.fn(() => Effect.void)

      yield* runFor({
        runPipelineSpy,
        getAlertImpl,
        getUpdatesImpl: makeGetUpdates(makeCallbackUpdate({ data: "other:1:2" })),
      })

      expect(getAlertImpl).not.toHaveBeenCalled()
      expect(runPipelineSpy).not.toHaveBeenCalled()
    }))

  it.effect("continues processing the rest of a batch after a defect handling one update", () =>
    Effect.gen(function* () {
      const runPipelineSpy = vi.fn((..._args: unknown[]) => Effect.void)
      const secondAlert: WatchAlert = { ...testAlert, id: WatchAlertId.make(8) }
      const badUpdate = makeCallbackUpdate({ id: "cb-bad" }, 1)
      const goodUpdate = makeCallbackUpdate(
        { id: "cb-good", data: `dl:${secondAlert.watchId}:${secondAlert.id}` },
        2,
      )

      let getUpdatesCalls = 0
      const getUpdatesImpl = () => {
        getUpdatesCalls++
        return getUpdatesCalls === 1 ? Effect.succeed([badUpdate, goodUpdate]) : Effect.never
      }

      let getAlertCalls = 0
      const getAlertImpl = () => {
        getAlertCalls++
        return getAlertCalls === 1
          ? Effect.sync(() => {
              throw new Error("boom")
            })
          : Effect.succeed(secondAlert)
      }

      yield* runFor({ runPipelineSpy, getUpdatesImpl, getAlertImpl })

      // The first (bad) update's defect must not prevent the second (good)
      // update in the same batch from being processed.
      expect(runPipelineSpy).toHaveBeenCalledTimes(1)
      expect(runPipelineSpy.mock.calls[0][0]).toMatchObject({ title: secondAlert.title })
    }))

  it.effect("does not call getUpdates when Telegram is not configured", () =>
    Effect.gen(function* () {
      const getUpdatesImpl = vi.fn(() => Effect.succeed([] as TelegramUpdate[]))

      yield* runFor({
        config: { telegram: { botToken: "", chatId: "" } },
        getUpdatesImpl,
      }, 50)

      expect(getUpdatesImpl).not.toHaveBeenCalled()
    }))
})
