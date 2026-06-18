import { Effect, Layer } from "effect"
import {
  type KomgaLibrary,
  type KomgaSeries,
  type KomgaBook,
  KomgaNotConfigured,
  KomgaHttpError,
} from "@inkpipe/shared"
import { ConfigService } from "./Config"

export class KomgaService extends Effect.Tag("KomgaService")<
  KomgaService,
  {
    readonly listLibraries: Effect.Effect<KomgaLibrary[], KomgaNotConfigured | KomgaHttpError>
    readonly listAllSeries: (libraryId?: string) => Effect.Effect<KomgaSeries[], KomgaNotConfigured | KomgaHttpError>
    readonly getSeriesThumbnail: (seriesId: string) => Effect.Effect<string, KomgaNotConfigured | KomgaHttpError>
    readonly getBooksForSeries: (seriesId: string) => Effect.Effect<KomgaBook[], KomgaNotConfigured | KomgaHttpError>
  }
>() {}

interface KomgaPage<T> {
  content: T[]
  totalPages: number
  totalElements: number
  number: number
}

export const KomgaServiceLive = Layer.effect(
  KomgaService,
  Effect.gen(function* () {
    const configService = yield* ConfigService

    const getApiInfo = () =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.catchAll((e) => Effect.fail(new KomgaNotConfigured({ message: e.message }))),
        )
        const { url, apiKey } = config.komga
        if (!url || !apiKey) {
          return yield* Effect.fail(
            new KomgaNotConfigured({ message: "Komga is not configured" }),
          )
        }
        return { url, apiKey }
      })

    const komgaFetch = (
      info: { url: string; apiKey: string },
      path: string,
      init?: RequestInit,
    ) =>
      Effect.tryPromise({
        try: async () => {
          const fullUrl = `${info.url.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
          const response = await fetch(fullUrl, {
            ...init,
            headers: { "X-API-Key": info.apiKey, "Content-Type": "application/json", ...init?.headers },
          })
          if (!response.ok) {
            let body = ""
            try { body = await response.text() } catch { /* */ }
            throw new Error(`Komga HTTP ${response.status}: ${body || response.statusText}`)
          }
          return response
        },
        catch: (e) => {
          const message = e instanceof Error ? e.message : String(e)
          return new KomgaHttpError({ message })
        },
      })

    const listLibraries = Effect.gen(function* () {
      console.log("[komga] listLibraries")
      const info = yield* getApiInfo()
      const response = yield* komgaFetch(info, "api/v1/libraries")
      const data = yield* Effect.tryPromise({
        try: () => response.json() as Promise<KomgaLibrary[]>,
        catch: (e) => new KomgaHttpError({ message: `Failed to parse libraries: ${e}` }),
      })
      console.log(`[komga] listLibraries — ${data.length} libraries`)
      return data
    })

    const listAllSeries = (libraryId?: string) =>
      Effect.gen(function* () {
        console.log(`[komga] listAllSeries${libraryId ? ` (libraryId=${libraryId})` : ""}`)
        const info = yield* getApiInfo()
        const all: KomgaSeries[] = []
        let page = 0
        let totalPages = 1

        while (page < totalPages) {
          console.log(`[komga] listAllSeries — fetching page ${page}/${totalPages - 1}`)
          const body = libraryId
            ? { condition: { libraryId: { operator: "is", value: libraryId } } }
            : {}
          const searchParams = new URLSearchParams({
            page: String(page),
            size: "500",
            sort: "metadata.titleSort,asc",
          })
          const response = yield* komgaFetch(
            info,
            `api/v1/series/list?${searchParams.toString()}`,
            { method: "POST", body: JSON.stringify(body) },
          )
          const data = (yield* Effect.tryPromise({
            try: () => response.json(),
            catch: (e) => new KomgaHttpError({ message: `Failed to parse series: ${e}` }),
          })) as KomgaPage<KomgaSeries>
          all.push(...data.content)
          totalPages = data.totalPages
          page++
        }
        console.log(`[komga] listAllSeries — ${all.length} series`)
        return all
      })

    const getSeriesThumbnail = (seriesId: string) =>
      Effect.gen(function* () {
        console.log(`[komga] getSeriesThumbnail seriesId=${seriesId}`)
        const info = yield* getApiInfo()
        const response = yield* komgaFetch(info, `api/v1/series/${seriesId}/thumbnail`)
        const arrayBuffer = yield* Effect.tryPromise({
          try: () => response.arrayBuffer(),
          catch: (e) => new KomgaHttpError({ message: `Failed to read thumbnail: ${e}` }),
        })
        const base64 = Buffer.from(arrayBuffer).toString("base64")
        return `data:image/jpeg;base64,${base64}`
      })

    const getBooksForSeries = (seriesId: string) =>
      Effect.gen(function* () {
        console.log(`[komga] getBooksForSeries seriesId=${seriesId}`)
        const info = yield* getApiInfo()
        const body = { condition: { seriesId: { operator: "is", value: seriesId } } }
        const searchParams = new URLSearchParams({
          page: "0",
          size: "500",
          sort: "metadata.numberSort,desc",
        })
        const response = yield* komgaFetch(
          info,
          `api/v1/books/list?${searchParams.toString()}`,
          { method: "POST", body: JSON.stringify(body) },
        )
        const data = (yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (e) => new KomgaHttpError({ message: `Failed to parse books: ${e}` }),
        })) as KomgaPage<KomgaBook>
        console.log(`[komga] getBooksForSeries — ${data.content.length} books`)
        return data.content
      })

    return { listLibraries, listAllSeries, getSeriesThumbnail, getBooksForSeries }
  }),
)
