import { useQuery } from "@tanstack/react-query";
import type { ProwlarrResult, KomgaSeries } from "../lib/types";
import { api } from "../hooks/useApiClient";
import { findBestMatch } from "@inkpipe/shared";
import { Checkbox } from "../ui/checkbox";

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatRelativeTime(dateStr: string | null): { relative: string; full: string } | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  let relative: string;
  if (seconds < 60) relative = "just now";
  else if (minutes < 60) relative = `${minutes}m ago`;
  else if (hours < 24) relative = `${hours}h ago`;
  else if (days < 7) relative = `${days}d ago`;
  else if (weeks < 5) relative = `${weeks}w ago`;
  else if (months < 12) relative = `${months}mo ago`;
  else relative = `${years}y ago`;

  return { relative, full: date.toLocaleDateString() };
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
    queryKey: ["komga-series"],
    queryFn: () => api.post("komga/series", { json: {} }).json<KomgaSeries[]>(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const komgaSeries = komgaQuery.data ?? [];

  if (results.length === 0) return null;

  const allSelected =
    results.length > 0 && results.every((r) => selected.has(r.guid));
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="island-shell overflow-hidden rounded-2xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-secondary">
            <th className="p-3">
              <Checkbox.Root
                checked={someSelected ? "indeterminate" : allSelected}
                onCheckedChange={() => onToggleAll()}
              >
                <Checkbox.Control />
              </Checkbox.Root>
            </th>
            <th className="p-3">Title</th>
            <th className="p-3">Date</th>
            <th className="p-3">Size</th>
            <th className="p-3">Seeders</th>
            <th className="p-3">Indexer</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => {
            const match = komgaSeries.length > 0
              ? findBestMatch(result.title, komgaSeries)
              : null;

            return (
              <tr
                key={result.guid}
                className="border-b border-border last:border-0 hover:bg-surface-hover"
                onClick={() => onToggle(result.guid)}
              >
                <td className="p-3">
                  <Checkbox.Root
                    checked={selected.has(result.guid)}
                    onCheckedChange={() => onToggle(result.guid)}
                  >
                    <Checkbox.Control />
                  </Checkbox.Root>
                </td>
                <td className="max-w-md p-3 text-primary">
                  <span className="block truncate">{result.title}</span>
                  {match && (
                    <span
                      title={`Komga match score: ${(match.score * 100).toFixed(0)}%`}
                      className="mt-1 inline-flex items-center gap-1 rounded-md border border-[rgba(114,135,253,0.3)] bg-[rgba(136,57,239,0.1)] px-1.5 py-0.5 text-[10px] font-semibold text-accent-hover"
                    >
                      In Komga · {match.seriesName} · {match.booksCount} {match.booksCount === 1 ? "book" : "books"}
                    </span>
                  )}
                </td>
                <td className="p-3 text-secondary">
                  {(() => {
                    const ft = formatRelativeTime(result.publishDate ?? null);
                    return ft ? (
                      <span title={ft.full}>{ft.relative}</span>
                    ) : (
                      <span className="text-secondary">—</span>
                    );
                  })()}
                </td>
                <td className="p-3 text-secondary">
                  {formatSize(result.size)}
                </td>
                <td className="p-3 text-secondary">
                  {result.seeders}
                </td>
                <td className="p-3 text-secondary">
                  {result.indexer}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
