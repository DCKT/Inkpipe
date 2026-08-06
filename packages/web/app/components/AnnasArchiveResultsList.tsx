import { useState } from "react";
import { BookOpen, Download, ExternalLink, Languages } from "lucide-react";
import type { AnnasArchiveResult } from "../lib/types";
import { Checkbox } from "../ui/checkbox";

interface AnnasArchiveResultsListProps {
  results: AnnasArchiveResult[];
  selected: Set<string>;
  onToggle: (md5: string) => void;
  onToggleAll: () => void;
}

export default function AnnasArchiveResultsList({
  results,
  selected,
  onToggle,
  onToggleAll,
}: AnnasArchiveResultsListProps) {
  if (results.length === 0) return null;

  const allSelected =
    results.length > 0 && results.every((r) => selected.has(r.md5));
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div className="flex flex-col gap-3">
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

      <div className="flex flex-col gap-2">
        {results.map((result) => (
          <AnnasArchiveResultCard
            key={result.md5}
            result={result}
            isSelected={selected.has(result.md5)}
            onToggle={() => onToggle(result.md5)}
          />
        ))}
      </div>
    </div>
  );
}

interface AnnasArchiveResultCardProps {
  result: AnnasArchiveResult;
  isSelected: boolean;
  onToggle: () => void;
}

function AnnasArchiveResultCard({
  result,
  isSelected,
  onToggle,
}: AnnasArchiveResultCardProps) {
  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = result.coverUrl && !coverFailed;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`relative flex cursor-pointer gap-4 rounded-sm border p-3 transition ${
        isSelected
          ? "border-accent bg-accent-tint"
          : "border-border hover:bg-surface-hover"
      }`}
    >
      <div className="absolute right-2 top-2 flex items-center gap-1">
        <a
          href={`https://annas-archive.gl/md5/${result.md5}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="View details"
          className="flex h-6 w-6 items-center justify-center rounded-[2px] text-secondary transition hover:bg-surface-hover hover:text-primary"
        >
          <ExternalLink size={14} />
        </a>
        <a
          href={`https://annas-archive.gl/slow_download/${result.md5}/0/0`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Slow download"
          className="flex h-6 w-6 items-center justify-center rounded-[2px] text-secondary transition hover:bg-surface-hover hover:text-primary"
        >
          <Download size={14} />
        </a>
      </div>

      <div onClick={(e) => e.stopPropagation()} className="pt-1">
        <Checkbox.Root checked={isSelected} onCheckedChange={onToggle}>
          <Checkbox.Control />
        </Checkbox.Root>
      </div>

      <div className="cover-shell aspect-[2/3] w-16 shrink-0 bg-surface relative sm:w-20">
        {showCover ? (
          <img
            src={result.coverUrl!}
            alt=""
            loading="lazy"
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-secondary/50">
            <BookOpen size={22} />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <span className="block truncate font-display text-lg italic text-primary sm:text-xl">
          {result.title}
        </span>
        {result.author && (
          <span className="truncate text-sm text-secondary">
            {result.author}
          </span>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {result.language && (
            <span className="status-pill status-pill-accent">
              <Languages size={12} />
              {result.language}
            </span>
          )}
          {result.extension && (
            <span className="rounded-[2px] border border-border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-secondary">
              {result.extension}
            </span>
          )}
          {result.size && (
            <span className="font-mono text-xs text-secondary">
              {result.size}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
