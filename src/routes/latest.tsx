import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import ResultsTable from "../components/ResultsTable";
import { latestMangasFn } from "../server/functions/latest";
import { startDownloadFn } from "../server/functions/download";
import type { ProwlarrResult } from "../lib/api/prowlarr";

export const Route = createFileRoute("/latest")({ component: LatestPage });

function LatestPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const latestQuery = useQuery({
    queryKey: ["latest-mangas"],
    queryFn: () => latestMangasFn(),
  });

  const downloadMutation = useMutation({
    mutationFn: (items: ProwlarrResult[]) =>
      startDownloadFn({ data: { items } }),
    onSuccess: () => {
      setSelected(new Set());
    },
  });

  const results = latestQuery.data ?? [];

  const handleToggle = (guid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (results.every((r) => selected.has(r.guid))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(results.map((r) => r.guid)));
    }
  };

  const handleDownload = () => {
    const items = results.filter((r) => selected.has(r.guid));
    if (items.length > 0) {
      downloadMutation.mutate(items);
    }
  };

  return (
    <main className="page-wrap px-4 pb-8 pt-8 flex flex-col gap-6">
      <section className="flex items-center justify-between">
        <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)]">
          Latest Mangas
        </h1>
        <button
          onClick={() => latestQuery.refetch()}
          disabled={latestQuery.isFetching}
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] disabled:opacity-50"
        >
          {latestQuery.isFetching ? "Refreshing..." : "Refresh"}
        </button>
      </section>

      {latestQuery.isError && (
        <div className="island-shell rounded-2xl border-red-200 p-4 text-sm text-red-600">
          {latestQuery.error.message}
        </div>
      )}

      {downloadMutation.isSuccess && (
        <p
          onClick={() => downloadMutation.reset()}
          className="text-center text-sm border border-palm py-2 rounded text-[var(--palm)]"
        >
          Started {downloadMutation.data.started} downloads. Check the Jobs page
          for progress.
        </p>
      )}

      <ResultsTable
        results={results}
        selected={selected}
        onToggle={handleToggle}
        onToggleAll={handleToggleAll}
      />

      {selected.size > 0 && (
        <div className="sticky bottom-4 flex justify-center">
          <button
            onClick={handleDownload}
            disabled={downloadMutation.isPending}
            className="rounded-full border border-[rgba(50,143,151,0.3)] bg-[var(--lagoon)] px-8 py-3 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-[var(--lagoon-deep)] disabled:opacity-50"
          >
            {downloadMutation.isPending
              ? "Starting..."
              : `Download ${selected.size} selected`}
          </button>
        </div>
      )}
    </main>
  );
}
