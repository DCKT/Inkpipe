import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../hooks/useApiClient";
import type { Watch, WatchAlert, ProwlarrResult } from "../lib/types";
import { ToastGroup } from "../ui/toast";
import { WatchFormDialog } from "../components/WatchForm";
import DownloadModal from "../components/DownloadModal";

export default function WatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [modalItems, setModalItems] = useState<ProwlarrResult[] | null>(null);

  const watchQuery = useQuery({
    queryKey: ["watches", id],
    queryFn: () => api.get(`watches/${id}`).json<Watch>(),
    enabled: !!id,
  });

  const alertsQuery = useQuery({
    queryKey: ["watch-alerts", id],
    queryFn: () =>
      api.get(`watches/${id}/alerts`).json<{ alerts: WatchAlert[] }>(),
    enabled: !!id,
    refetchInterval: 60_000,
  });

  const ackMutation = useMutation({
    mutationFn: (alertId: string) =>
      api.post(`watches/${id}/alerts/${alertId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watch-alerts", id] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  const ackAllMutation = useMutation({
    mutationFn: () => api.post(`watches/${id}/alerts/acknowledge-all`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watch-alerts", id] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
      ToastGroup.create.success("All alerts acknowledged");
    },
  });

  const downloadMutation = useMutation({
    mutationFn: (vars: {
      items: ProwlarrResult[];
      subfolder?: string;
      newFolder?: boolean;
      alertId: string;
    }) =>
      api
        .post("download", {
          json: {
            items: vars.items,
            subfolder: vars.subfolder,
            newFolder: vars.newFolder,
          },
        })
        .json<{ started: number }>(),
    onSuccess: (data, { alertId }) => {
      queryClient.invalidateQueries({ queryKey: ["copyparty-folders"] });
      api.post(`watches/${id}/alerts/${alertId}/acknowledge`);
      queryClient.invalidateQueries({ queryKey: ["watch-alerts", id] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
      ToastGroup.create.success(
        `Started ${data.started} download`,
        "Check the Jobs page for progress.",
      );
    },
    onError: (err) => {
      ToastGroup.create.error("Failed to start download", err.message);
    },
  });

  const alerts = alertsQuery.data?.alerts ?? [];
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  const alertToProwlarrResult = (alert: WatchAlert): ProwlarrResult => ({
    title: alert.title,
    guid: alert.guid,
    magnetUrl: alert.magnetUrl,
    downloadUrl: null,
    size: alert.size,
    seeders: alert.seeders,
    indexer: alert.indexer,
    categories: [],
    publishDate: null,
  });

  const handleModalClose = () => setModalItems(null);

  const handleModalConfirm = (
    items: ProwlarrResult[],
    subfolder?: string,
    newFolder?: boolean,
  ) => {
    const alertId = alerts.find((a) => a.guid === items[0]?.guid)?.id;
    if (alertId) {
      downloadMutation.mutate({ items, subfolder, newFolder, alertId });
    }
    setModalItems(null);
  };

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <div className="mb-6 flex items-center gap-3">
        <button
          className="text-sm text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
          onClick={() => navigate("/watches")}
        >
          &larr; Back
        </button>
      </div>

      {watchQuery.isLoading && (
        <p className="text-sm text-[var(--sea-ink-soft)]">Loading watch...</p>
      )}

      {watchQuery.isError && (
        <div className="island-shell mb-6 rounded-2xl border-red-200 p-4 text-sm text-red-600">
          Failed to load watch.
        </div>
      )}

      {watchQuery.data && (
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="display-title text-4xl font-bold text-[var(--sea-ink)]">
                {watchQuery.data.name}
              </h1>
              <p className="text-sm text-[var(--sea-ink-soft)] mt-1">
                Query:{" "}
                <code className="text-xs bg-[var(--chip-bg)] px-1.5 py-0.5 rounded">
                  {watchQuery.data.query}
                </code>{" "}
                · Every {watchQuery.data.intervalSeconds}s ·{" "}
                <span
                  className={
                    watchQuery.data.enabled ? "text-green-600" : "text-gray-400"
                  }
                >
                  {watchQuery.data.enabled ? "Active" : "Paused"}
                </span>
              </p>
              {watchQuery.data.filterGroups.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {watchQuery.data.filterGroups.map((g, gi) => (
                    <span
                      key={gi}
                      className="text-xs bg-[var(--chip-bg)] border border-[var(--chip-line)] rounded-full px-2 py-0.5 text-[var(--sea-ink-soft)]"
                    >
                      {g.mode}: {g.substrings.join(", ")}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <WatchFormDialog
              existing={watchQuery.data}
              onCreated={() => {
                queryClient.invalidateQueries({ queryKey: ["watches", id] });
                queryClient.invalidateQueries({ queryKey: ["watches"] });
              }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
          Alerts
          {unacknowledgedCount > 0 && (
            <span className="ml-2 text-sm font-normal text-[var(--lagoon)]">
              ({unacknowledgedCount} new)
            </span>
          )}
        </h2>
        {unacknowledgedCount > 0 && (
          <button
            className="text-xs text-[var(--lagoon)] hover:text-[var(--lagoon-deep)]"
            onClick={() => ackAllMutation.mutate()}
            disabled={ackAllMutation.isPending}
          >
            Acknowledge All
          </button>
        )}
      </div>

      {alertsQuery.isLoading && (
        <p className="text-sm text-[var(--sea-ink-soft)]">Loading alerts...</p>
      )}

      {alertsQuery.isError && (
        <div className="island-shell mb-6 rounded-2xl border-red-200 p-4 text-sm text-red-600">
          Failed to load alerts.
        </div>
      )}

      {alerts.length === 0 && (
        <div className="island-shell rounded-2xl p-8 text-center">
          <p className="text-sm text-[var(--sea-ink-soft)]">
            No alerts yet. Alerts appear here when new Prowlarr results match
            your filters.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`island-shell rounded-2xl p-3 flex items-center justify-between ${
              alert.acknowledged ? "opacity-50" : ""
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--sea-ink)] truncate">
                {alert.title}
              </p>
              <p className="text-xs text-[var(--sea-ink-soft)] mt-0.5">
                {alert.indexer} · {alert.seeders} seeders ·{" "}
                {formatSize(alert.size)} ·{" "}
                {new Date(alert.matchedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-3 shrink-0">
              <button
                className="text-xs text-[var(--lagoon)] hover:text-[var(--lagoon)]/80 px-2 py-1 rounded-lg hover:bg-[var(--chip-bg)] transition-colors"
                onClick={() => setModalItems([alertToProwlarrResult(alert)])}
              >
                Download
              </button>
              {!alert.acknowledged && (
                <button
                  className="text-xs text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] px-2 py-1 rounded-lg hover:bg-[var(--chip-bg)] transition-colors"
                  onClick={() => ackMutation.mutate(alert.id)}
                >
                  Acknowledge
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modalItems && (
        <DownloadModal
          items={modalItems}
          onConfirm={handleModalConfirm}
          onClose={handleModalClose}
        />
      )}
    </main>
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
