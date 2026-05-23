import { useState, useEffect, useRef } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Library } from "lucide-react";
import {
  getKomgaSeriesFn,
  getKomgaLibrariesFn,
  getKomgaSeriesThumbnailFn,
} from "../server/functions/komga";
import { getSettingsFn } from "../server/functions/settings";
import type { KomgaSeries } from "../lib/api/komga";
import KomgaBooksModal from "../components/KomgaBooksModal";

export const Route = createFileRoute("/komga")({
  beforeLoad: async () => {
    const config = await getSettingsFn();
    if (!config.komga.url || !config.komga.apiKey) {
      throw redirect({ to: "/settings", search: { komgaNotConfigured: true } });
    }
  },
  component: KomgaPage,
});

const STATUS_COLORS: Record<string, string> = {
  ONGOING: "text-emerald-600 bg-emerald-50 border-emerald-200",
  ENDED: "text-[var(--sea-ink-soft)] bg-[var(--surface)] border-[var(--line)]",
  HIATUS: "text-amber-600 bg-amber-50 border-amber-200",
  ABANDONED: "text-red-500 bg-red-50 border-red-200",
};

function SeriesCard({
  series,
  onClick,
}: {
  series: KomgaSeries;
  onClick: () => void;
}) {
  const statusClass =
    STATUS_COLORS[series.metadata.status] ?? STATUS_COLORS.ENDED;
  const ref = useRef<HTMLButtonElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const thumbnailQuery = useQuery({
    queryKey: ["komga-thumbnail", series.id],
    queryFn: () => getKomgaSeriesThumbnailFn({ data: { seriesId: series.id } }),
    enabled: isVisible,
    staleTime: Infinity,
  });

  return (
    <button
      ref={ref}
      onClick={onClick}
      className="island-shell group flex flex-col gap-0 rounded-2xl overflow-hidden text-left transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {/* Cover */}
      <div className="aspect-[2/3] w-full bg-[var(--surface-strong)] relative overflow-hidden">
        {!thumbnailQuery.data && (
          <div className="absolute inset-0 animate-pulse bg-[var(--surface-strong)]" />
        )}
        {thumbnailQuery.data && (
          <img
            src={thumbnailQuery.data}
            alt={series.metadata.title || series.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      {/* Info */}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--sea-ink)] group-hover:text-[var(--lagoon)]">
            {series.metadata.title || series.name}
          </p>
          {series.metadata.status && (
            <span
              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusClass}`}
            >
              {series.metadata.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--sea-ink-soft)]">
          <Library size={12} />
          <span>
            {series.booksCount} {series.booksCount === 1 ? "book" : "books"}
          </span>
        </div>
      </div>
    </button>
  );
}

function KomgaPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<KomgaSeries | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    null,
  );

  // Load saved config to get defaultLibraryId
  const configQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettingsFn(),
    staleTime: 5 * 60 * 1000,
  });

  // Load libraries for tabs
  const librariesQuery = useQuery({
    queryKey: ["komga-libraries"],
    queryFn: () => getKomgaLibrariesFn(),
    staleTime: 5 * 60 * 1000,
  });

  // Initialise selected library from saved default once config + libraries are loaded
  useEffect(() => {
    if (selectedLibraryId !== null) return;
    if (!configQuery.data) return;
    const defaultId = configQuery.data.komga.defaultLibraryId || "";
    setSelectedLibraryId(defaultId);
  }, [configQuery.data, selectedLibraryId]);

  const activeLibraryId = selectedLibraryId ?? "";

  const seriesQuery = useQuery({
    queryKey: ["komga-series", activeLibraryId],
    queryFn: () =>
      getKomgaSeriesFn({ data: { libraryId: activeLibraryId || undefined } }),
    // staleTime: 5 * 60 * 1000,
    enabled: selectedLibraryId !== null, // wait until default is resolved
  });

  const series = seriesQuery.data ?? [];

  const filtered = search.trim()
    ? series.filter((s) =>
        (s.metadata.title || s.name)
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : series;

  const libraries = librariesQuery.data ?? [];

  return (
    <main className="page-wrap px-4 pb-8 pt-8 flex flex-col gap-6">
      {/* Header */}
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)]">
            Komga Library
          </h1>
          {seriesQuery.data && (
            <p className="mt-1 text-sm text-[var(--sea-ink-soft)]">
              {series.length} series
            </p>
          )}
        </div>
        <button
          onClick={async () => {
            await queryClient.invalidateQueries({
              queryKey: ["komga-series", activeLibraryId],
            });
          }}
          disabled={seriesQuery.isFetching}
          className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] disabled:opacity-50"
        >
          {seriesQuery.isFetching ? "Loading..." : "Refresh"}
        </button>
      </section>

      {/* Library tabs */}
      {libraries.length > 0 && (
        <div className="flex gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] p-1 w-fit">
          <button
            onClick={() => setSelectedLibraryId("")}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              activeLibraryId === ""
                ? "bg-[var(--lagoon)] text-white shadow-sm"
                : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
            }`}
          >
            All
          </button>
          {libraries.map((lib) => (
            <button
              key={lib.id}
              onClick={() => setSelectedLibraryId(lib.id)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                activeLibraryId === lib.id
                  ? "bg-[var(--lagoon)] text-white shadow-sm"
                  : "text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
              }`}
            >
              {lib.name}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--sea-ink-soft)]"
        />
        <input
          type="text"
          placeholder="Filter series..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] py-2.5 pl-10 pr-4 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none"
        />
      </div>

      {seriesQuery.isError && (
        <div className="island-shell rounded-2xl border-red-200 p-4 text-sm text-red-600">
          {seriesQuery.error.message}
        </div>
      )}

      {(seriesQuery.isLoading || selectedLibraryId === null) && (
        <div className="flex items-center justify-center py-24 text-sm text-[var(--sea-ink-soft)]">
          Loading library...
        </div>
      )}

      {filtered.length === 0 &&
        !seriesQuery.isLoading &&
        !seriesQuery.isError &&
        selectedLibraryId !== null && (
          <div className="py-24 text-center text-sm text-[var(--sea-ink-soft)]">
            {search
              ? "No series match your search."
              : "No series found in Komga."}
          </div>
        )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((s) => (
            <SeriesCard key={s.id} series={s} onClick={() => setSelected(s)} />
          ))}
        </div>
      )}

      {selected && (
        <KomgaBooksModal series={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}
