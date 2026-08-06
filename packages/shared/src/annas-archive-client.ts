import type { AnnasArchiveResult } from "./schemas"

/** Stable partition: results matching `preferredLanguage` (by its bracketed code, e.g. "[fr]") float to the top. */
export function sortAnnasArchiveResults(
  results: AnnasArchiveResult[],
  preferredLanguage = "fr",
): AnnasArchiveResult[] {
  const code = `[${preferredLanguage.toLowerCase()}]`
  const isPreferred = (r: AnnasArchiveResult) => r.language?.toLowerCase().includes(code) ?? false
  return results
    .slice()
    .sort((a, b) => Number(isPreferred(b)) - Number(isPreferred(a)))
}
