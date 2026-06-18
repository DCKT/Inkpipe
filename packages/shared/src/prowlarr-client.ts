import type { ProwlarrResult } from "./schemas"

export function transformProwlarrResult(item: Record<string, unknown>): ProwlarrResult {
  return {
    title: String(item.title ?? ""),
    guid: String(item.guid ?? ""),
    magnetUrl: (item.magnetUrl as string) ?? null,
    downloadUrl: (item.downloadUrl as string) ?? null,
    size: Number(item.size ?? 0),
    seeders: Number(item.seeders ?? 0),
    indexer: String(item.indexer ?? ""),
    categories: Array.isArray(item.categories)
      ? item.categories.map((c: Record<string, unknown>) => String(c.name ?? ""))
      : [],
    publishDate: typeof item.publishDate === "string" ? item.publishDate : null,
  }
}

export function sortProwlarrResults(results: ProwlarrResult[]): ProwlarrResult[] {
  return results.sort((a, b) => {
    if (!a.publishDate && !b.publishDate) return 0
    if (!a.publishDate) return 1
    if (!b.publishDate) return -1
    return b.publishDate.localeCompare(a.publishDate)
  })
}

export function buildProwlarrSearchParams(
  params: Record<string, string | string[]>,
): URLSearchParams {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) searchParams.append(key, v)
    } else {
      searchParams.set(key, value)
    }
  }
  return searchParams
}
