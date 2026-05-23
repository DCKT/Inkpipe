import { useQuery } from '@tanstack/react-query'
import type { ProwlarrResult } from "../lib/api/prowlarr";
import { getKomgaSeriesFn } from '../server/functions/komga'
import { findBestMatch } from '../lib/titleMatch'

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

interface ResultsTableProps {
  results: ProwlarrResult[];
  selected: Set<string>;
  onToggle: (guid: string) => void;
  onToggleAll: () => void;
}

export default function ResultsTable({
  results,
  selected,
  onToggle,
  onToggleAll,
}: ResultsTableProps) {
  const komgaQuery = useQuery({
    queryKey: ['komga-series'],
    queryFn: () => getKomgaSeriesFn({ data: {} }),
    staleTime: 5 * 60 * 1000,
    // Don't throw — if Komga isn't configured just show nothing
    retry: false,
  })

  const komgaSeries = komgaQuery.data ?? []

  if (results.length === 0) return null;

  const allSelected =
    results.length > 0 && results.every((r) => selected.has(r.guid));

  return (
    <div className="island-shell overflow-hidden rounded-2xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wider text-[var(--sea-ink-soft)]">
            <th className="p-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="accent-[var(--lagoon)]"
              />
            </th>
            <th className="p-3">Title</th>
            <th className="p-3">Size</th>
            <th className="p-3">Seeders</th>
            <th className="p-3">Indexer</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => {
            const match = komgaSeries.length > 0
              ? findBestMatch(result.title, komgaSeries)
              : null

            return (
              <tr
                key={result.guid}
                className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface)]"
                onClick={() => onToggle(result.guid)}
              >
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(result.guid)}
                    onChange={() => onToggle(result.guid)}
                    className="accent-[var(--lagoon)]"
                  />
                </td>
                <td className="max-w-md p-3 text-[var(--sea-ink)]">
                  <span className="block truncate">{result.title}</span>
                  {match && (
                    <span
                      title={`Komga match score: ${(match.score * 100).toFixed(0)}%`}
                      className="mt-1 inline-flex items-center gap-1 rounded-md border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.1)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--lagoon-deep)]"
                    >
                      In Komga · {match.seriesName} · {match.booksCount} {match.booksCount === 1 ? 'book' : 'books'}
                    </span>
                  )}
                </td>
                <td className="p-3 text-[var(--sea-ink-soft)]">
                  {formatSize(result.size)}
                </td>
                <td className="p-3 text-[var(--sea-ink-soft)]">
                  {result.seeders}
                </td>
                <td className="p-3 text-[var(--sea-ink-soft)]">
                  {result.indexer}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  );
}
