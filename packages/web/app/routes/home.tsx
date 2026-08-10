import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown } from "lucide-react";
import SearchBar from "../components/SearchBar";
import ResultsTable from "../components/ResultsTable";
import DownloadModal from "../components/DownloadModal";
import { PageHeader } from "../components/PageHeader";
import { runApi } from "../lib/apiClient";
import type { ProwlarrResult } from "../lib/types";
import { ToastGroup } from "../ui/toast";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalItems, setModalItems] = useState<ProwlarrResult[] | null>(null);

  const searchQuery = useQuery({
    queryKey: ["search", query],
    queryFn: () => runApi((client) => client.search.search({ query: { q: query } })),
    enabled: query.length > 0,
  });

  const queryClient = useQueryClient();

  const downloadMutation = useMutation({
    mutationFn: ({
      items,
      subfolder,
      newFolder,
    }: {
      items: ProwlarrResult[];
      subfolder?: string;
      newFolder?: boolean;
    }) =>
      runApi((client) => client.download.download({ payload: { items, subfolder, newFolder } })),
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

  const handleModalConfirm = (
    items: ProwlarrResult[],
    subfolder?: string,
    newFolder?: boolean,
  ) => {
    downloadMutation.mutate({ items, subfolder, newFolder });
  };

  return (
    <main className="page-wrap sm:px-4 pb-8 pt-8 flex flex-col gap-4">
      <PageHeader
        numeral="I"
        label="Prowlarr"
        title="Search"
        meta={searchQuery.data ? `${results.length} results` : undefined}
      />

      <section className="">
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
          <button
            type="button"
            onClick={handleDownloadClick}
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
