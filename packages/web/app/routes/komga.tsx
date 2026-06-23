import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Library } from "lucide-react";
import { api } from "../hooks/useApiClient";
import type { KomgaSeries, KomgaLibrary, AppConfig } from "../lib/types";
import KomgaBooksModal from "../components/KomgaBooksModal";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ToggleGroup } from "../ui/toggle-group";

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
      api
        .get("komga/thumbnail", { searchParams: { seriesId: series.id } })
        .json<{ thumbnail: string }>()
        .then((data) => data.thumbnail),
    enabled: isVisible,
    staleTime: Infinity,
  });

  return (
    <button
      ref={ref}
      onClick={onClick}
      className="island-shell group flex flex-col gap-0 rounded-2xl overflow-hidden text-left transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="aspect-[2/3] min-w-64 w-full bg-surface relative overflow-hidden">
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
    queryFn: () => api.get("settings").json<AppConfig>(),
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
    queryFn: () => api.post("komga/libraries").json<KomgaLibrary[]>(),
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
      api
        .post("komga/series", {
          json: { libraryId: activeLibraryId || undefined },
        })
        .json<KomgaSeries[]>(),
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
      <main className="page-wrap px-4 pb-8 pt-8 flex items-center justify-center py-24">
        <span className="text-sm text-secondary">Loading...</span>
      </main>
    );
  }

  return (
    <main className="page-wrap px-4 pb-8 pt-8 flex flex-col gap-6">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="display-title text-3xl font-bold text-primary">
            Komga Library
          </h1>
          {seriesQuery.data && (
            <p className="mt-1 text-sm text-secondary">
              {series.length} series
            </p>
          )}
        </div>
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
        <ToggleGroup.Root
          value={[activeLibraryId]}
          onValueChange={(details) =>
            setSelectedLibraryId(details.value[0] ?? "")
          }
        >
          <ToggleGroup.Item value="">All</ToggleGroup.Item>
          {libraries.map((lib) => (
            <ToggleGroup.Item key={lib.id} value={lib.id}>
              {lib.name}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
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
          <div className="py-24 text-center text-sm text-secondary">
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
