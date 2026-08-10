import { Effect, Layer } from "effect"
import { describe, it, expect } from "@effect/vitest"
import type { AppConfig } from "@inkpipe/shared"
import { ConfigService, ConfigServiceLive } from "./Config"
import { testDbLayer } from "../../__mocks__/testDb"

function makeProgram<T, E>(prog: (svc: typeof ConfigService.Service) => Effect.Effect<T, E>) {
  return Effect.gen(function* () {
    const svc = yield* ConfigService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(ConfigServiceLive, testDbLayer)))
}

describe("ConfigService", () => {
  it.effect("loadConfig on a freshly-migrated DB returns the documented first-run defaults", () =>
    Effect.gen(function* () {
      const config = yield* makeProgram((svc) => svc.loadConfig)

      expect(config.prowlarr).toEqual({ url: "", apiKey: "" })
      expect(config.alldebrid).toEqual({ apiKey: "" })
      expect(config.copyparty).toEqual({ url: "", uploadPath: "/", password: "" })
      expect(config.komga).toEqual({ url: "", apiKey: "", defaultLibraryId: "" })
      expect(config.annasArchive).toEqual({ apiKey: "", baseUrl: "https://annas-archive.gl" })

      // KCC has per-field true/false defaults, not a blanket false — this is
      // the exact set of fields the migration's column DEFAULTs mark `1`.
      expect(config.kcc.upscale).toBe(true)
      expect(config.kcc.forceColor).toBe(true)
      expect(config.kcc.eraseRainbow).toBe(true)
      expect(config.kcc.mangaStyle).toBe(false)
      expect(config.kcc.webtoon).toBe(false)
      expect(config.kcc.twoPanel).toBe(false)
      expect(config.kcc.stretch).toBe(false)
      expect(config.kcc.hq).toBe(false)
      expect(config.kcc.forcePng).toBe(false)
      expect(config.kcc.noAutoContrast).toBe(false)
      expect(config.kcc.blackBorders).toBe(false)
      expect(config.kcc.whiteBorders).toBe(false)
      expect(config.kcc.noProcessing).toBe(false)
      expect(config.kcc.coverFill).toBe(false)
      expect(config.kcc.noKepub).toBe(false)
      expect(config.kcc.dockerImage).toBe("ghcr.io/ciromattia/kcc:latest")
      expect(config.kcc.profile).toBe("KoBO")
      expect(config.kcc.format).toBe("Auto")
      expect(config.kcc.cropping).toBe("1")
      expect(config.kcc.splitter).toBe("0")
      expect(config.kcc.batchSplit).toBe("0")
    }))

  it.effect("saveConfig then loadConfig round-trips every section, including booleans that default true", () =>
    Effect.gen(function* () {
      const overrides: AppConfig = {
        prowlarr: { url: "http://prowlarr.local", apiKey: "prowlarr-key" },
        alldebrid: { apiKey: "alldebrid-key" },
        kcc: {
          dockerImage: "custom/kcc:latest", profile: "Kindle", format: "MOBI",
          mangaStyle: true, webtoon: true, twoPanel: true,
          // these three default `true` at the DB level — round-tripping `false`
          // specifically verifies saveConfig/loadConfig don't silently coerce
          // a false back to the default true.
          upscale: false, stretch: true, hq: true, gamma: 2.2,
          cropping: "2", croppingPower: 1.5,
          forceColor: false,
          forcePng: true, noAutoContrast: true, blackBorders: true,
          whiteBorders: true, splitter: "1", noProcessing: true,
          eraseRainbow: false, coverFill: true, batchSplit: "2",
          targetSize: 500, customWidth: 800, customHeight: 1200, noKepub: true,
        },
        copyparty: { url: "http://copyparty.local", uploadPath: "/books", password: "secret" },
        komga: { url: "http://komga.local", apiKey: "komga-key", defaultLibraryId: "lib-1" },
        annasArchive: { apiKey: "aa-key", baseUrl: "https://annas-archive.example" },
      }

      const roundTripped = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          yield* svc.saveConfig(overrides)
          return yield* svc.loadConfig
        }),
      )

      expect(roundTripped).toEqual(overrides)
    }))

  it.effect("calling saveConfig twice updates the same row in place (no duplicate/stale rows)", () =>
    Effect.gen(function* () {
      const first: AppConfig = {
        prowlarr: { url: "http://prowlarr.local", apiKey: "key1" },
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
        annasArchive: { apiKey: "", baseUrl: "https://annas-archive.gl" },
      }

      const final = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          yield* svc.saveConfig(first)
          yield* svc.saveConfig({ ...first, alldebrid: { apiKey: "key2" } })
          return yield* svc.loadConfig
        }),
      )

      // If saveConfig ever mis-used INSERT instead of UPDATE, a second call would
      // create a duplicate row and loadConfig's `rows[0]` would silently read
      // whichever row SQLite happens to return first, not necessarily the latest.
      expect(final.prowlarr).toEqual({ url: "http://prowlarr.local", apiKey: "key1" })
      expect(final.alldebrid).toEqual({ apiKey: "key2" })
    }))
})
