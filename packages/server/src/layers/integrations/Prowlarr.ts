import { Context, Effect, Layer } from "effect"
import {
  type ProwlarrResult,
  ProwlarrNotConfigured,
  ProwlarrHttpError,
  transformProwlarrResult,
  sortProwlarrResults,
  buildProwlarrSearchParams,
} from "@inkpipe/shared"
import { ConfigService, requireConfigured } from "../core/Config"
import { LogService } from "../core/Log"

const PROWLARR_TIMEOUT_MS = 30000

export class ProwlarrService extends Context.Service<
  ProwlarrService,
  {
    readonly search: (query: string) => Effect.Effect<ProwlarrResult[], ProwlarrNotConfigured | ProwlarrHttpError>
    readonly getLatest: Effect.Effect<ProwlarrResult[], ProwlarrNotConfigured | ProwlarrHttpError>
  }
>()("ProwlarrService") {}

export const ProwlarrServiceLive = Layer.effect(
  ProwlarrService,
  Effect.gen(function* () {
    const configService = yield* ConfigService
    const log = yield* LogService

    const search = (query: string) =>
      Effect.gen(function* () {
        const { url, apiKey } = yield* requireConfigured(
          configService,
          (c) => c.prowlarr,
          (p) => p.url.length > 0 && p.apiKey.length > 0,
          "Prowlarr is not configured",
          (message) => new ProwlarrNotConfigured({ message }),
        )

        return yield* Effect.tryPromise({
          try: () =>
            doProwlarrSearch(`${url}/api/v1/search`, apiKey, { query, type: "search" }, log),
          catch: (e) => {
            if (e instanceof DOMException && e.name === "TimeoutError") {
              return new ProwlarrHttpError({
                message: `Prowlarr search timed out after ${PROWLARR_TIMEOUT_MS / 1000}s`,
              })
            }
            const message = e instanceof Error ? e.message : String(e)
            return new ProwlarrHttpError({ message: `Prowlarr search failed: ${message}` })
          },
        })
      })

    const getLatest = Effect.gen(function* () {
      const { url, apiKey } = yield* requireConfigured(
        configService,
        (c) => c.prowlarr,
        (p) => p.url.length > 0 && p.apiKey.length > 0,
        "Prowlarr is not configured",
        (message) => new ProwlarrNotConfigured({ message }),
      )

      return yield* Effect.tryPromise({
        try: () =>
          doProwlarrSearch(`${url}/api/v1/search`, apiKey, {
            type: "search",
            categories: ["8010", "7030"],
          }, log),
        catch: (e) => {
          if (e instanceof DOMException && e.name === "TimeoutError") {
            return new ProwlarrHttpError({
              message: `Prowlarr latest timed out after ${PROWLARR_TIMEOUT_MS / 1000}s`,
            })
          }
          const message = e instanceof Error ? e.message : String(e)
          return new ProwlarrHttpError({ message: `Prowlarr latest failed: ${message}` })
        },
      })
    })

    return { search, getLatest }
  }),
)

async function doProwlarrSearch(
  url: string,
  apiKey: string,
  params: Record<string, string | string[]>,
  log: { info: (namespace: string, ...message: unknown[]) => Effect.Effect<void> },
): Promise<ProwlarrResult[]> {
  Effect.runSync(log.info("prowlarr", "Fetching:", url, params))
  const searchParams = buildProwlarrSearchParams(params)
  const response = await fetch(`${url}?${searchParams.toString()}`, {
    headers: { "X-Api-Key": apiKey },
    signal: AbortSignal.timeout(PROWLARR_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  const data = (await response.json()) as Array<Record<string, unknown>>
  return sortProwlarrResults(data.map(transformProwlarrResult))
}
