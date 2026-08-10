import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown } from "lucide-react";
import ResultsTable from "../components/ResultsTable";
import { PageHeader } from "../components/PageHeader";
import { runApi } from "../lib/apiClient";
import type { ProwlarrResult } from "../lib/types";
import { Button } from "../ui/button";
import { ToastGroup } from "../ui/toast";

export default function LatestPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const latestQuery = useQuery({
    queryKey: ["latest-mangas"],
    queryFn: () => runApi((client) => client.latest.latest({})),
  });

  const downloadMutation = useMutation({
    mutationFn: (items: ProwlarrResult[]) =>
      runApi((client) => client.download.download({ payload: { items } })),
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
    <main className="page-wrap sm:px-4 pb-8 pt-8 flex flex-col gap-6">
      <PageHeader
        numeral="II"
        label="Latest"
        title="Latest Mangas"
        meta={latestQuery.data ? `${results.length} results` : undefined}
      />

      <section className="flex items-center justify-end">
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
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadMutation.isPending}
            className="flex items-center gap-2 rounded-[3px] border border-accent bg-surface px-4 py-2 font-mono text-xs font-semibold text-accent shadow-lg transition hover:bg-accent-tint disabled:opacity-50"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-[2px] border border-accent">
              <ArrowDown size={12} />
            </span>
            {downloadMutation.isPending
              ? "Starting..."
              : `Download ${selected.size} selected`}
          </button>
        </div>
      )}
    </main>
  );
}
