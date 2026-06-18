import { Effect, Layer } from "effect"
import { describe, it, expect, vi } from "vitest"
import type { AppConfig } from "@inkpipe/shared"
import { getSettingsHandler, updateSettingsHandler } from "../routes/settings"
import { ConfigService } from "../layers/Config"

const mockConfig: AppConfig = {
  prowlarr: { url: "http://p:9696", apiKey: "pk" },
  alldebrid: { apiKey: "ak" },
  kcc: {
    dockerImage: "kcc:latest", profile: "KoBO", format: "Auto",
    mangaStyle: false, webtoon: false, twoPanel: false,
    upscale: true, stretch: false, hq: false, gamma: 1.0,
    cropping: "1", croppingPower: 1.0, forceColor: true,
    forcePng: false, noAutoContrast: false, blackBorders: false,
    whiteBorders: false, splitter: "0", noProcessing: false,
    eraseRainbow: true, coverFill: false, batchSplit: "0",
    targetSize: 0, customWidth: 0, customHeight: 0, noKepub: false,
  },
  copyparty: { url: "http://cp:3923", uploadPath: "/comics", password: "" },
  komga: { url: "http://k:8080", apiKey: "kk", defaultLibraryId: "lib-1" },
}

describe("getSettingsHandler", () => {
  it("returns config as JSON", async () => {
    const layer = Layer.succeed(ConfigService, {
      loadConfig: Effect.succeed(mockConfig),
      saveConfig: () => Effect.void,
    } as any)

    const response = await Effect.runPromise(
      getSettingsHandler.pipe(Effect.provide(layer)),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.prowlarr.url).toBe("http://p:9696")
  })

  it("returns 500 with error message on failure", async () => {
    const layer = Layer.succeed(ConfigService, {
      loadConfig: Effect.fail({ message: "Failed to load config" } as any),
      saveConfig: () => Effect.void,
    } as any)

    const response = await Effect.runPromise(
      getSettingsHandler.pipe(Effect.provide(layer)),
    )

    expect(response.status).toBe(500)
    const body = await response.json() as any
    expect(body.error).toBe("Failed to load config")
  })
})

describe("updateSettingsHandler", () => {
  it("saves config and returns success", async () => {
    const saveConfigSpy = vi.fn(() => Effect.void)
    const layer = Layer.succeed(ConfigService, {
      loadConfig: Effect.succeed(mockConfig),
      saveConfig: saveConfigSpy,
    } as any)

    const response = await Effect.runPromise(
      updateSettingsHandler(mockConfig).pipe(Effect.provide(layer)),
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.success).toBe(true)
  })

  it("returns 500 with error message on failure", async () => {
    const layer = Layer.succeed(ConfigService, {
      loadConfig: Effect.succeed(mockConfig),
      saveConfig: () => Effect.fail({ message: "Save failed" } as any),
    } as any)

    const response = await Effect.runPromise(
      updateSettingsHandler(mockConfig).pipe(Effect.provide(layer)),
    )

    expect(response.status).toBe(500)
    const body = await response.json() as any
    expect(body.error).toBe("Save failed")
  })
})
