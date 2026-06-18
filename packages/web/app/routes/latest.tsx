import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import ResultsTable from "../components/ResultsTable";
import { api } from "../hooks/useApiClient";
import type { ProwlarrResult } from "../lib/types";
import { Button } from "../ui/button";
import { ToastGroup } from "../ui/toast";

export default function LatestPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const latestQuery = useQuery({
    queryKey: ["latest-mangas"],
    queryFn: () => api.get("latest").json<ProwlarrResult[]>(),
  });

  const downloadMutation = useMutation({
    mutationFn: (items: ProwlarrResult[]) =>
      api.post("download", { json: { items } }).json<{ started: number }>(),
    onSuccess: (data) => {
      setSelected(new Set());
      ToastGroup.create.success(
        `Started ${data.started} downloads`,
        "Check the Jobs page for progress.",
      );
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
        <Button
          variant="refresh"
          onClick={() => latestQuery.refetch()}
          disabled={latestQuery.isFetching}
        >
          {latestQuery.isFetching ? "Refreshing..." : "Refresh"}
        </Button>
      </section>

      {latestQuery.isError && (
        <div className="island-shell rounded-2xl border-red-200 p-4 text-sm text-red-600">
          {latestQuery.error.message}
        </div>
      )}

      <ResultsTable
        results={results}
        selected={selected}
        onToggle={handleToggle}
        onToggleAll={handleToggleAll}
      />

      {selected.size > 0 && (
        <div className="sticky bottom-4 flex justify-center">
          <Button
            variant="floating"
            onClick={handleDownload}
            disabled={downloadMutation.isPending}
          >
            {downloadMutation.isPending
              ? "Starting..."
              : `Download ${selected.size} selected`}
          </Button>
        </div>
      )}
    </main>
  );
}
