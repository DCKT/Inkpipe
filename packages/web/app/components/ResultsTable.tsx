import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CloudDownload, Check, X, Loader2 } from "lucide-react";
import type { ProwlarrResult } from "../lib/types";
import { runApi } from "../lib/apiClient";
import { findBestMatch } from "@inkpipe/shared";
import { Checkbox } from "../ui/checkbox";
import { Tooltip } from "../ui/tooltip";

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
  results: readonly ProwlarrResult[];
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
    queryFn: () => runApi((client) => client.komga.series({ payload: {} })),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const komgaSeries = komgaQuery.data ?? [];

  // Computed once per results/komgaSeries change and shared by both the
  // mobile card list and the desktop table below (only one is visible via
  // CSS at a time, but both render unconditionally) — avoids running the
  // fuzzy title match twice per result on every render.
  const matches = useMemo(() => {
    if (komgaSeries.length === 0) return new Map<string, ReturnType<typeof findBestMatch>>();
    return new Map(results.map((r) => [r.guid, findBestMatch(r.title, komgaSeries)]));
  }, [results, komgaSeries]);

  if (results.length === 0) return null;

  const allSelected =
    results.length > 0 && results.every((r) => selected.has(r.guid));
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <>
      {/* Card layout below sm: a fixed-column table can't fit a phone screen */}
      <div className="flex flex-col gap-2 sm:hidden">
        <div className="flex items-center gap-2.5 px-1">
          <Checkbox.Root
            checked={someSelected ? "indeterminate" : allSelected}
            onCheckedChange={() => onToggleAll()}
          >
            <Checkbox.Control />
          </Checkbox.Root>
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
            Select all
          </span>
        </div>
        {results.map((result) => {
          const match = matches.get(result.guid) ?? null;
          const ft = formatRelativeTime(result.publishDate ?? null);

          return (
            <div
              key={result.guid}
              className={`flex cursor-pointer gap-3 rounded-sm border p-3 transition ${
                selected.has(result.guid)
                  ? "border-accent bg-accent-tint"
                  : "border-border hover:bg-surface-hover"
              }`}
              onClick={() => onToggle(result.guid)}
            >
              <div onClick={(e) => e.stopPropagation()} className="pt-1">
                <Checkbox.Root
                  checked={selected.has(result.guid)}
                  onCheckedChange={() => onToggle(result.guid)}
                >
                  <Checkbox.Control />
                </Checkbox.Root>
              </div>
              <div className="min-w-0 flex-1">
                <span className="block break-words font-display text-primary">
                  {result.title}
                </span>
                {match && (
                  <span
                    title={`Komga match score: ${(match.score * 100).toFixed(0)}%`}
                    className="status-pill mt-1 font-mono text-[10px] text-accent-hover"
                  >
                    In Komga · {match.seriesName} · {match.booksCount} {match.booksCount === 1 ? "book" : "books"}
                  </span>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-secondary">
                  {ft ? <span title={ft.full}>{ft.relative}</span> : null}
                  <span>{formatSize(result.size)}</span>
                  <span>{result.seeders} seeders</span>
                  <span className="truncate">{result.indexer}</span>
                </div>
              </div>
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <SaveToAllDebridButton result={result} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Table layout from sm up */}
      <div className="hidden overflow-x-auto rounded-sm border border-border sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-primary/60 text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-secondary">
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
              <th className="hidden p-3 md:table-cell">Size</th>
              <th className="hidden p-3 lg:table-cell">Seeders</th>
              <th className="hidden p-3 lg:table-cell">Indexer</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => {
              const match = matches.get(result.guid) ?? null;

              return (
                <tr
                  key={result.guid}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-hover ${
                    index % 2 === 1 ? "bg-surface" : ""
                  }`}
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
                    <span className="block break-words font-display">
                      {result.title}
                    </span>
                    {match && (
                      <span
                        title={`Komga match score: ${(match.score * 100).toFixed(0)}%`}
                        className="status-pill mt-1 font-mono text-[10px] text-accent-hover"
                      >
                        In Komga · {match.seriesName} · {match.booksCount} {match.booksCount === 1 ? "book" : "books"}
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-xs text-secondary">
                    {(() => {
                      const ft = formatRelativeTime(result.publishDate ?? null);
                      return ft ? (
                        <span title={ft.full}>{ft.relative}</span>
                      ) : (
                        <span className="text-secondary">—</span>
                      );
                    })()}
                  </td>
                  <td className="hidden p-3 font-mono text-xs text-secondary md:table-cell">
                    {formatSize(result.size)}
                  </td>
                  <td className="hidden p-3 font-mono text-xs text-secondary lg:table-cell">
                    {result.seeders}
                  </td>
                  <td className="hidden p-3 font-mono text-xs text-secondary lg:table-cell">
                    {result.indexer}
                  </td>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                    <SaveToAllDebridButton result={result} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SaveToAllDebridButton({ result }: { result: ProwlarrResult }) {
  const mutation = useMutation({
    mutationFn: () =>
      runApi((client) =>
        client.alldebrid.saveMagnet({
          payload: { magnetUrl: result.magnetUrl, downloadUrl: result.downloadUrl },
        }),
      ),
  });

  const tooltipLabel = mutation.isError
    ? mutation.error instanceof Error
      ? mutation.error.message
      : "Failed to save to AllDebrid"
    : mutation.isSuccess
      ? "Saved to AllDebrid"
      : "Save to AllDebrid";

  return (
    <Tooltip.Root>
      <Tooltip.Trigger>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          className="flex h-6 w-6 items-center justify-center rounded-[2px] text-secondary transition hover:bg-surface-hover hover:text-primary disabled:cursor-not-allowed"
        >
          {mutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : mutation.isSuccess ? (
            <Check size={14} className="text-accent-hover" />
          ) : mutation.isError ? (
            <X size={14} className="text-red-500" />
          ) : (
            <CloudDownload size={14} />
          )}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content>{tooltipLabel}</Tooltip.Content>
    </Tooltip.Root>
  );
}
