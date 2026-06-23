import { Effect, Layer } from "effect"
import {
  type ProwlarrResult,
  ProwlarrNotConfigured,
  ProwlarrHttpError,
  transformProwlarrResult,
  sortProwlarrResults,
  buildProwlarrSearchParams,
} from "@inkpipe/shared"
import { ConfigService } from "./Config"
import { LogService } from "./Log"

export class ProwlarrService extends Effect.Tag("ProwlarrService")<
  ProwlarrService,
  {
    readonly search: (query: string) => Effect.Effect<ProwlarrResult[], ProwlarrNotConfigured | ProwlarrHttpError>
    readonly getLatest: Effect.Effect<ProwlarrResult[], ProwlarrNotConfigured | ProwlarrHttpError>
  }
>() {}

export const ProwlarrServiceLive = Layer.effect(
  ProwlarrService,
  Effect.gen(function* () {
    const configService = yield* ConfigService
    const log = yield* LogService

    const search = (query: string) =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.catchAll((e) => Effect.fail(new ProwlarrNotConfigured({ message: e.message }))),
        )
        const { url, apiKey } = config.prowlarr
        if (!url || !apiKey) {
          return yield* Effect.fail(
            new ProwlarrNotConfigured({ message: "Prowlarr is not configured" }),
          )
        }

        return yield* Effect.tryPromise({
          try: () =>
            doProwlarrSearch(`${url}/api/v1/search`, apiKey, { query, type: "search" }, log),
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e)
            return new ProwlarrHttpError({ message: `Prowlarr search failed: ${message}` })
          },
        })
      })

    const getLatest = Effect.gen(function* () {
      const config = yield* configService.loadConfig.pipe(
        Effect.catchAll((e) => Effect.fail(new ProwlarrNotConfigured({ message: e.message }))),
      )
      const { url, apiKey } = config.prowlarr
      if (!url || !apiKey) {
        return yield* Effect.fail(
          new ProwlarrNotConfigured({ message: "Prowlarr is not configured" }),
        )
      }

      return yield* Effect.tryPromise({
        try: () =>
          doProwlarrSearch(`${url}/api/v1/search`, apiKey, {
            type: "search",
            categories: ["8010", "7030"],
          }, log),
        catch: (e) => {
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
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  const data = (await response.json()) as Array<Record<string, unknown>>
  return sortProwlarrResults(data.map(transformProwlarrResult))
}
