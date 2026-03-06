import type { ProwlarrResult } from '../lib/api/prowlarr'

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

interface ResultsTableProps {
  results: ProwlarrResult[]
  selected: Set<string>
  onToggle: (guid: string) => void
  onToggleAll: () => void
}

export default function ResultsTable({
  results,
  selected,
  onToggle,
  onToggleAll,
}: ResultsTableProps) {
  if (results.length === 0) return null

  const allSelected = results.length > 0 && results.every((r) => selected.has(r.guid))

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
          {results.map((result) => (
            <tr
              key={result.guid}
              className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface)]"
            >
              <td className="p-3">
                <input
                  type="checkbox"
                  checked={selected.has(result.guid)}
                  onChange={() => onToggle(result.guid)}
                  className="accent-[var(--lagoon)]"
                />
              </td>
              <td className="max-w-md truncate p-3 text-[var(--sea-ink)]">
                {result.title}
              </td>
              <td className="p-3 text-[var(--sea-ink-soft)]">
                {formatSize(result.size)}
              </td>
              <td className="p-3 text-[var(--sea-ink-soft)]">{result.seeders}</td>
              <td className="p-3 text-[var(--sea-ink-soft)]">{result.indexer}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
