import {
  type ProwlarrResult,
  type ProwlarrConfig,
  transformProwlarrResult,
  sortProwlarrResults,
  buildProwlarrSearchParams,
} from "@inkpipe/shared"

export async function searchProwlarr(
  config: ProwlarrConfig,
  query: string,
): Promise<ProwlarrResult[]> {
  const searchParams = buildProwlarrSearchParams({ query, type: "search" })
  const url = `${config.url}/api/v1/search?${searchParams.toString()}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  const data = (await response.json()) as Array<Record<string, unknown>>
  return sortProwlarrResults(data.map(transformProwlarrResult))
}
