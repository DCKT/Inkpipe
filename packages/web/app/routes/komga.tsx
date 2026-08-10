import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Library } from "lucide-react";
import { runApi } from "../lib/apiClient";
import type { KomgaSeries } from "../lib/types";
import KomgaBooksModal from "../components/KomgaBooksModal";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const STATUS_COLORS: Record<string, string> = {
  ONGOING: "text-emerald-600 bg-emerald-50 border-emerald-200",
  ENDED: "text-secondary bg-surface-hover border-border",
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
    queryFn: () =>
      runApi((client) => client.komga.thumbnail({ query: { seriesId: series.id } })).then(
        (data) => data.thumbnail,
      ),
    enabled: isVisible,
    staleTime: Infinity,
  });

  return (
    <button
      ref={ref}
      onClick={onClick}
      className="group flex flex-col gap-0 rounded-sm text-left transition hover:-translate-y-0.5"
    >
      <div className="cover-shell aspect-[2/3] min-w-64 w-full bg-surface relative">
        {!thumbnailQuery.data && (
          <div className="absolute inset-0 animate-pulse bg-surface" />
        )}
        {thumbnailQuery.data && (
          <img
            src={thumbnailQuery.data}
            alt={series.metadata.title || series.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-primary group-hover:text-accent">
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
        <div className="flex items-center gap-1.5 text-xs text-secondary">
          <Library size={12} />
          <span>
            {series.booksCount} {series.booksCount === 1 ? "book" : "books"}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function KomgaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<KomgaSeries | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    null,
  );

  const komgaNotConfigured = searchParams.get("komgaNotConfigured") === "true";

  const configQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => runApi((client) => client.settings.get({})),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (configQuery.isSuccess) {
      if (!configQuery.data.komga.url || !configQuery.data.komga.apiKey) {
        navigate("/settings?komgaNotConfigured=true");
      }
    }
  }, [configQuery.isSuccess, configQuery.data, navigate]);

  const librariesQuery = useQuery({
    queryKey: ["komga-libraries"],
    queryFn: () => runApi((client) => client.komga.libraries({})),
    staleTime: 5 * 60 * 1000,
  });

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
      runApi((client) =>
        client.komga.series({ payload: { libraryId: activeLibraryId || undefined } }),
      ),
    enabled: selectedLibraryId !== null,
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

  if (configQuery.isLoading) {
    return (
      <main className="page-wrap sm:px-4 pb-8 pt-8 flex items-center justify-center py-24">
        <span className="text-sm text-secondary">Loading...</span>
      </main>
    );
  }

  return (
    <main className="page-wrap sm:px-4 pb-8 pt-8 flex flex-col gap-6">
      <PageHeader
        numeral="III"
        label="Komga"
        title="Library"
        meta={seriesQuery.data ? `${series.length} series` : undefined}
      />

      <section className="flex items-center justify-end">
        <Button
          variant="refresh"
          onClick={async () => {
            await queryClient.invalidateQueries({
              queryKey: ["komga-series", activeLibraryId],
            });
          }}
          disabled={seriesQuery.isFetching}
        >
          {seriesQuery.isFetching ? "Loading..." : "Refresh"}
        </Button>
      </section>

      {komgaNotConfigured && (
        <div className="island-shell rounded-2xl border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Komga is not configured yet. Please enter your Komga URL and API key
          in Settings.
        </div>
      )}

      {libraries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedLibraryId("")}
            className={`chip ${activeLibraryId === "" ? "chip-active" : ""}`}
          >
            All
          </button>
          {libraries.map((lib) => (
            <button
              key={lib.id}
              type="button"
              onClick={() => setSelectedLibraryId(lib.id)}
              className={`chip ${activeLibraryId === lib.id ? "chip-active" : ""}`}
            >
              {lib.name}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary"
        />
        <Input
          type="text"
          placeholder="Filter series..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {seriesQuery.isError && (
        <div className="island-shell rounded-2xl border-red-200 p-4 text-sm text-red-600">
          {seriesQuery.error.message}
        </div>
      )}

      {(seriesQuery.isLoading || selectedLibraryId === null) && (
        <div className="flex items-center justify-center py-24 text-sm text-secondary">
          Loading library...
        </div>
      )}

      {filtered.length === 0 &&
        !seriesQuery.isLoading &&
        !seriesQuery.isError &&
        selectedLibraryId !== null && (
          <div className="blank-page flex flex-col items-center gap-3 p-8 text-center">
            <div className="blank-page-icon" />
            <p className="font-display text-lg italic text-primary">
              {search ? "No matches" : "Nothing on the shelf"}
            </p>
            <p className="text-sm text-secondary">
              {search
                ? "No series match your search."
                : "No series found in Komga."}
            </p>
          </div>
        )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 ">
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
