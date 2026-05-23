import ky, { HTTPError } from 'ky'
import type { AppConfig } from '../config'

export interface KomgaLibrary {
  id: string
  name: string
}

export interface KomgaSeries {
  id: string
  name: string
  booksCount: number
  metadata: {
    status: string
    title: string
  }
}

export interface KomgaBook {
  id: string
  name: string
  number: number
  created: string
  size: string
  media: {
    pagesCount: number
    mediaType: string
  }
  metadata: {
    title: string
    number: string
  }
}

interface KomgaPage<T> {
  content: T[]
  totalPages: number
  totalElements: number
  number: number
}

function komgaClient(config: AppConfig) {
  const { url, apiKey } = config.komga
  if (!url || !apiKey) throw new Error('Komga is not configured')
  return ky.create({
    prefixUrl: url,
    headers: { 'X-API-Key': apiKey },
    timeout: 30000,
  })
}

async function parseKomgaError(err: unknown, context: string): Promise<never> {
  if (err instanceof HTTPError) {
    let body = ''
    try {
      body = await err.response.text()
    } catch {}
    console.error(
      `[komga] ${context} — HTTP ${err.response.status} ${err.response.statusText}`,
      body,
    )
    throw new Error(
      `Komga ${context} failed: HTTP ${err.response.status} — ${body || err.response.statusText}`,
    )
  }
  console.error(`[komga] ${context} — unexpected error:`, err)
  throw err
}

export async function listLibraries(config: AppConfig): Promise<KomgaLibrary[]> {
  const client = komgaClient(config)
  console.log('[komga] listLibraries — fetching')
  try {
    const data = await client.get('api/v1/libraries').json<KomgaLibrary[]>()
    console.log(`[komga] listLibraries — ${data.length} libraries`)
    return data
  } catch (err) {
    await parseKomgaError(err, 'listLibraries')
  }
  return []
}

export async function listAllSeries(config: AppConfig, libraryId?: string): Promise<KomgaSeries[]> {
  const client = komgaClient(config)
  const allSeries: KomgaSeries[] = []
  let page = 0
  let totalPages = 1

  console.log(`[komga] listAllSeries — starting fetch${libraryId ? ` (libraryId=${libraryId})` : ''}`)

  try {
    while (page < totalPages) {
      console.log(`[komga] listAllSeries — fetching page ${page} / ${totalPages - 1}`)

      const data = await client
        .post('api/v1/series/list', {
          // Empty body `{}` is required — sending `{"condition":{}}` causes a 400
          // because the API cannot resolve the polymorphic SearchCondition subtype.
          json: libraryId ? { condition: { libraryId: { operator: 'is', value: libraryId } } } : {},
          searchParams: { page, size: 500, sort: 'metadata.titleSort,asc' },
        })
        .json<KomgaPage<KomgaSeries>>()

      allSeries.push(...data.content)
      totalPages = data.totalPages
      page++
    }
  } catch (err) {
    await parseKomgaError(err, 'listAllSeries')
  }

  console.log(`[komga] listAllSeries — done, ${allSeries.length} series`)
  return allSeries
}

export async function getSeriesThumbnail(
  seriesId: string,
  config: AppConfig,
): Promise<string> {
  const client = komgaClient(config)
  console.log(`[komga] getSeriesThumbnail — seriesId=${seriesId}`)
  try {
    const buffer = await client
      .get(`api/v1/series/${seriesId}/thumbnail`)
      .arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    return `data:image/jpeg;base64,${base64}`
  } catch (err) {
    await parseKomgaError(err, `getSeriesThumbnail(${seriesId})`)
  }
  return ''
}

export async function getBooksForSeries(
  seriesId: string,
  config: AppConfig,
): Promise<KomgaBook[]> {
  const client = komgaClient(config)

  console.log(`[komga] getBooksForSeries — seriesId=${seriesId}`)

  try {
    const data = await client
      .post('api/v1/books/list', {
        json: { condition: { seriesId: { operator: 'is', value: seriesId } } },
        searchParams: { page: 0, size: 500, sort: 'metadata.numberSort,desc' },
      })
      .json<KomgaPage<KomgaBook>>()

    console.log(`[komga] getBooksForSeries — ${data.content.length} books for seriesId=${seriesId}`)
    return data.content
  } catch (err) {
    await parseKomgaError(err, `getBooksForSeries(${seriesId})`)
  }
  return [] // unreachable — parseKomgaError always throws
}
