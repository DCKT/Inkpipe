import ky from 'ky'
import type { AppConfig } from '../config'

export interface ProwlarrResult {
  title: string
  guid: string
  magnetUrl: string | null
  downloadUrl: string | null
  size: number
  seeders: number
  indexer: string
  categories: string[]
}

export async function searchProwlarr(
  query: string,
  config: AppConfig,
): Promise<ProwlarrResult[]> {
  const { url, apiKey } = config.prowlarr
  if (!url || !apiKey) {
    throw new Error('Prowlarr is not configured')
  }

  const response = await ky
    .get(`${url}/api/v1/search`, {
      searchParams: { query, type: 'search' },
      headers: { 'X-Api-Key': apiKey },
      timeout: 30000,
    })
    .json<Array<Record<string, unknown>>>()

  return response.map((item) => ({
    title: String(item.title ?? ''),
    guid: String(item.guid ?? ''),
    magnetUrl: (item.magnetUrl as string) ?? null,
    downloadUrl: (item.downloadUrl as string) ?? null,
    size: Number(item.size ?? 0),
    seeders: Number(item.seeders ?? 0),
    indexer: String(item.indexer ?? ''),
    categories: Array.isArray(item.categories)
      ? item.categories.map((c: Record<string, unknown>) => String(c.name ?? ''))
      : [],
  }))
}
