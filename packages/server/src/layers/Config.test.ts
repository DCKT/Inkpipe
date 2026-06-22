import { Effect } from "effect"
import { describe, it, expect, beforeEach } from "vitest"
import { DbService } from "@inkpipe/db"
import { createMockDb, resetMockDb } from "../test/db"
import { ConfigService, ConfigServiceLive } from "./Config"

beforeEach(() => {
  resetMockDb()
})

describe("ConfigService", () => {
  describe("loadConfig", () => {
    it("returns default config when DB is empty", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* ConfigService
        return yield* svc.loadConfig
      }).pipe(Effect.provide(ConfigServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      expect(result.prowlarr).toEqual({ url: "", apiKey: "" })
      expect(result.alldebrid).toEqual({ apiKey: "" })
      expect(result.copyparty).toEqual({ url: "", uploadPath: "/", password: "" })
      expect(result.komga).toEqual({ url: "", apiKey: "", defaultLibraryId: "" })
    })

    it("returns KCC defaults when DB is empty", async () => {
      const { db } = createMockDb()
      const program = Effect.gen(function* () {
        const svc = yield* ConfigService
        return yield* svc.loadConfig
      }).pipe(Effect.provide(ConfigServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      expect(result.kcc.dockerImage).toBe("ghcr.io/ciromattia/kcc:latest")
      expect(result.kcc.profile).toBe("KoBO")
      expect(result.kcc.format).toBe("Auto")
      expect(result.kcc.upscale).toBe(true)
      expect(result.kcc.forceColor).toBe(true)
    })

    it("loads a previously saved config", async () => {
      const { db } = createMockDb()
      const insert = db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)")
      insert.run("prowlarr", JSON.stringify({ url: "http://prowlarr:9696", apiKey: "pk" }))
      insert.run("alldebrid", JSON.stringify({ apiKey: "adk" }))
      insert.run("kcc", JSON.stringify({ profile: "Kindle" }))
      insert.run("copyparty", JSON.stringify({ url: "http://cp:3923", uploadPath: "/comics", password: "pw" }))
      insert.run("komga", JSON.stringify({ url: "http://komga:8080", apiKey: "kk", defaultLibraryId: "lib-1" }))

      const program = Effect.gen(function* () {
        const svc = yield* ConfigService
        return yield* svc.loadConfig
      }).pipe(Effect.provide(ConfigServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      expect(result.prowlarr.url).toBe("http://prowlarr:9696")
      expect(result.prowlarr.apiKey).toBe("pk")
      expect(result.alldebrid.apiKey).toBe("adk")
      expect(result.kcc.profile).toBe("Kindle")
      expect(result.copyparty.url).toBe("http://cp:3923")
      expect(result.komga.apiKey).toBe("kk")
    })

    it("loads partial config and fills defaults for missing values", async () => {
      const { db } = createMockDb()
      const insert = db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)")
      insert.run("prowlarr", JSON.stringify({ url: "http://prowlarr:9696" }))

      const program = Effect.gen(function* () {
        const svc = yield* ConfigService
        return yield* svc.loadConfig
      }).pipe(Effect.provide(ConfigServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      expect(result.prowlarr.url).toBe("http://prowlarr:9696")
      expect(result.prowlarr.apiKey).toBe("") // default
      expect(result.alldebrid.apiKey).toBe("") // default
    })
  })

  describe("saveConfig", () => {
    it("persists all 5 config sections", async () => {
      const { db } = createMockDb()

      const saveProgram = Effect.gen(function* () {
        const svc = yield* ConfigService
        yield* svc.saveConfig({
          prowlarr: { url: "http://p:9696", apiKey: "pk1" },
          alldebrid: { apiKey: "ad1" },
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
          copyparty: { url: "http://cp:3923", uploadPath: "/", password: "" },
          komga: { url: "http://k:8080", apiKey: "kk1", defaultLibraryId: "" },
        })
      }).pipe(Effect.provide(ConfigServiceLive), Effect.provideService(DbService, { db }))

      await Effect.runPromise(saveProgram as any)

      const loadProgram = Effect.gen(function* () {
        const svc = yield* ConfigService
        return yield* svc.loadConfig
      }).pipe(Effect.provide(ConfigServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(loadProgram as any)

      expect(result.prowlarr.apiKey).toBe("pk1")
      expect(result.alldebrid.apiKey).toBe("ad1")
      expect(result.komga.apiKey).toBe("kk1")
    })

    it("replaces existing config on second save", async () => {
      const { db } = createMockDb()

      const program = Effect.gen(function* () {
        const svc = yield* ConfigService
        yield* svc.saveConfig({
          prowlarr: { url: "", apiKey: "first" },
          alldebrid: { apiKey: "" },
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
          copyparty: { url: "", uploadPath: "/", password: "" },
          komga: { url: "", apiKey: "", defaultLibraryId: "" },
        })
        yield* svc.saveConfig({
          prowlarr: { url: "", apiKey: "second" },
          alldebrid: { apiKey: "" },
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
          copyparty: { url: "", uploadPath: "/", password: "" },
          komga: { url: "", apiKey: "", defaultLibraryId: "" },
        })
        return yield* svc.loadConfig
      }).pipe(Effect.provide(ConfigServiceLive), Effect.provideService(DbService, { db }))

      const result: any = await Effect.runPromise(program as any)

      expect(result.prowlarr.apiKey).toBe("second")
    })
  })

  describe("error handling", () => {
    it("loadConfig catches Schema decode errors as ConfigLoadError", async () => {
      const { db } = createMockDb()
      const insert = db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)")
      insert.run("prowlarr", JSON.stringify("not_an_object"))

      const program = Effect.gen(function* () {
        const svc = yield* ConfigService
        return yield* svc.loadConfig
      }).pipe(Effect.provide(ConfigServiceLive), Effect.provideService(DbService, { db }))

      await expect(
        Effect.runPromise(program as any),
      ).rejects.toThrow("Failed to load config")
    })
  })
})
