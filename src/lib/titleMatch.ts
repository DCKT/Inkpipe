/**
 * Cleans a raw Prowlarr release title into a plain series name.
 * Strips: [Group tags], (year), vXX / Vol.XX / Ch.XX, file extensions,
 * resolution markers, language tags, extra punctuation.
 */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, '') // [Group] [tag]
    .replace(/\([^)]*\)/g, '')  // (year) (extra)
    .replace(/\b(v|vol\.?|volume|ch\.?|chapter)\s*\d+(\.\d+)?\b/gi, '')
    .replace(/\b\d{3,4}p\b/gi, '')   // 720p 1080p
    .replace(/\.(cbz|cbr|zip|rar|epub|pdf|7z)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Generates all trigrams (3-char substrings) from a string.
 */
function trigrams(s: string): Set<string> {
  const result = new Set<string>()
  const padded = `  ${s.toLowerCase()}  `
  for (let i = 0; i < padded.length - 2; i++) {
    result.add(padded.slice(i, i + 3))
  }
  return result
}

/**
 * Jaccard similarity between two trigram sets: |A ∩ B| / |A ∪ B|
 */
export function trigramScore(a: string, b: string): number {
  const ta = trigrams(a)
  const tb = trigrams(b)
  if (ta.size === 0 && tb.size === 0) return 1
  if (ta.size === 0 || tb.size === 0) return 0

  let intersection = 0
  for (const t of ta) {
    if (tb.has(t)) intersection++
  }

  const union = ta.size + tb.size - intersection
  return intersection / union
}

export interface MatchResult {
  seriesId: string
  seriesName: string
  score: number
  booksCount: number
}

/**
 * Finds the best-matching Komga series for a raw Prowlarr title.
 * Returns null if best score is below threshold.
 */
export function findBestMatch(
  rawTitle: string,
  series: { id: string; name: string; booksCount: number; metadata: { title: string } }[],
  threshold = 0.4,
): MatchResult | null {
  const cleaned = cleanTitle(rawTitle)
  let best: MatchResult | null = null

  for (const s of series) {
    const score = Math.max(
      trigramScore(cleaned, s.name),
      trigramScore(cleaned, s.metadata.title),
    )
    if (score >= threshold && (!best || score > best.score)) {
      best = { seriesId: s.id, seriesName: s.metadata.title || s.name, score, booksCount: s.booksCount }
    }
  }

  return best
}
