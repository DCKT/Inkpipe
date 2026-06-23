import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SearchBar from "../components/SearchBar";
import ResultsTable from "../components/ResultsTable";
import DownloadModal from "../components/DownloadModal";
import { api } from "../hooks/useApiClient";
import type { ProwlarrResult } from "../lib/types";
import { Button } from "../ui/button";
import { ToastGroup } from "../ui/toast";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalItems, setModalItems] = useState<ProwlarrResult[] | null>(null);

  const searchQuery = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.get("search", { searchParams: { q: query } }).json<ProwlarrResult[]>(),
    enabled: query.length > 0,
  });

  const queryClient = useQueryClient();

  const downloadMutation = useMutation({
    mutationFn: ({ items, subfolder, newFolder }: { items: ProwlarrResult[]; subfolder?: string; newFolder?: boolean }) =>
      api.post("download", { json: { items, subfolder, newFolder } }).json<{ started: number }>(),
    onSuccess: (data) => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["copyparty-folders"] });
      ToastGroup.create.success(
        `Started ${data.started} downloads`,
        "Check the Jobs page for progress.",
      );
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

  const handleDownloadClick = () => {
    const items = results.filter((r) => selected.has(r.guid));
    if (items.length > 0) {
      setModalItems(items);
    }
  };

  const handleModalConfirm = (items: ProwlarrResult[], subfolder?: string, newFolder?: boolean) => {
    downloadMutation.mutate({ items, subfolder, newFolder });
  };

  return (
    <main className="page-wrap px-4 pb-8 pt-8 flex flex-col gap-6">
      <section className="">
        <h1 className="display-title mb-4 text-3xl font-bold text-primary">
          Search
        </h1>
        <SearchBar onSearch={handleSearch} isLoading={searchQuery.isFetching} />
      </section>

      {searchQuery.isError && (
        <div className="island-shell  rounded-2xl border-red-200 p-4 text-sm text-red-600">
          {searchQuery.error.message}
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
            onClick={handleDownloadClick}
            disabled={downloadMutation.isPending}
          >
            {downloadMutation.isPending
              ? "Starting..."
              : `Download ${selected.size} selected`}
          </Button>
        </div>
      )}

      {modalItems && (
        <DownloadModal
          items={modalItems}
          onConfirm={handleModalConfirm}
          onClose={() => setModalItems(null)}
        />
      )}
    </main>
  );
}
