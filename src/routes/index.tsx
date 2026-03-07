import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import SearchBar from "../components/SearchBar";
import ResultsTable from "../components/ResultsTable";
import { searchFn } from "../server/functions/search";
import { startDownloadFn } from "../server/functions/download";
import type { ProwlarrResult } from "../lib/api/prowlarr";

export const Route = createFileRoute("/")({ component: SearchPage });

function SearchPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const searchQuery = useQuery({
    queryKey: ["search", query],
    queryFn: () => searchFn({ data: { query } }),
    enabled: query.length > 0,
  });

  const downloadMutation = useMutation({
    mutationFn: (items: ProwlarrResult[]) =>
      startDownloadFn({ data: { items } }),
    onSuccess: () => {
      setSelected(new Set());
    },
  });

  const results = searchQuery.data ?? [];

  const handleSearch = (q: string) => {
    setQuery(q);
    setSelected(new Set());
  };

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
      <section className="">
        <h1 className="display-title mb-4 text-3xl font-bold text-[var(--sea-ink)]">
          Search
        </h1>
        <SearchBar onSearch={handleSearch} isLoading={searchQuery.isFetching} />
      </section>

      {searchQuery.isError && (
        <div className="island-shell  rounded-2xl border-red-200 p-4 text-sm text-red-600">
          {searchQuery.error.message}
        </div>
      )}

      {downloadMutation.isSuccess && (
        <p className="text-center text-sm border border-palm py-2 rounded text-[var(--palm)]">
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
