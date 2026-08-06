import { Effect, Layer } from "effect"
import { describe, it, expect } from "@effect/vitest"
import { saveMagnetHandler } from "../routes/alldebrid"
import { AllDebridService } from "../layers/integrations/AllDebrid"

describe("saveMagnetHandler", () => {
  it.effect("uploads the magnet and returns id/ready", () =>
    Effect.gen(function* () {
      const layer = Layer.succeed(AllDebridService, {
        uploadMagnet: (target: string) => {
          expect(target).toBe("magnet:?xt=urn:btih:abc123")
          return Effect.succeed({ id: 42, ready: false })
        },
      } as any)

      const response = yield* saveMagnetHandler({ magnetUrl: "magnet:?xt=urn:btih:abc123" }).pipe(
        Effect.provide(layer),
      )

      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body).toEqual({ id: 42, ready: false })
    }))

  it.effect("falls back to downloadUrl when magnetUrl is absent", () =>
    Effect.gen(function* () {
      const layer = Layer.succeed(AllDebridService, {
        uploadMagnet: (target: string) => {
          expect(target).toBe("https://indexer.example.com/file.torrent")
          return Effect.succeed({ id: 7, ready: true })
        },
      } as any)

      const response = yield* saveMagnetHandler({
        magnetUrl: null,
        downloadUrl: "https://indexer.example.com/file.torrent",
      }).pipe(Effect.provide(layer))

      expect(response.status).toBe(200)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body).toEqual({ id: 7, ready: true })
    }))

  it.effect("returns 502 when neither magnetUrl nor downloadUrl is provided", () =>
    Effect.gen(function* () {
      const layer = Layer.succeed(AllDebridService, {
        uploadMagnet: () => Effect.succeed({ id: 0, ready: false }),
      } as any)

      const response = yield* saveMagnetHandler({}).pipe(Effect.provide(layer))

      expect(response.status).toBe(502)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.error).toBe("No magnet or download URL provided")
    }))

  it.effect("returns 502 with error message when AllDebrid is not configured", () =>
    Effect.gen(function* () {
      const layer = Layer.succeed(AllDebridService, {
        uploadMagnet: () => Effect.fail({ message: "AllDebrid API key not configured" } as any),
      } as any)

      const response = yield* saveMagnetHandler({ magnetUrl: "magnet:?xt=urn:btih:abc123" }).pipe(
        Effect.provide(layer),
      )

      expect(response.status).toBe(502)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.error).toBe("AllDebrid API key not configured")
    }))

  it.effect("returns 502 on upload failure", () =>
    Effect.gen(function* () {
      const layer = Layer.succeed(AllDebridService, {
        uploadMagnet: () => Effect.fail({ message: "Upload failed: network error" } as any),
      } as any)

      const response = yield* saveMagnetHandler({ magnetUrl: "magnet:?xt=urn:btih:abc123" }).pipe(
        Effect.provide(layer),
      )

      expect(response.status).toBe(502)
      const body = (yield* Effect.promise(() => response.json())) as any
      expect(body.error).toBe("Upload failed: network error")
    }))
})
