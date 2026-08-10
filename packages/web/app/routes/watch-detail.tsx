import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { runApi } from "../lib/apiClient";
import type { WatchAlert, ProwlarrResult } from "../lib/types";
import { ToastGroup } from "../ui/toast";
import { WatchFormDialog } from "../components/WatchForm";
import DownloadModal from "../components/DownloadModal";
import { PageHeader } from "../components/PageHeader";

export default function WatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [modalItems, setModalItems] = useState<ProwlarrResult[] | null>(null);

  const watchQuery = useQuery({
    queryKey: ["watches", id],
    queryFn: () => runApi((client) => client.watches.get({ params: { id: Number(id) } })),
    enabled: !!id,
  });

  const alertsQuery = useQuery({
    queryKey: ["watch-alerts", id],
    queryFn: () =>
      runApi((client) => client.watches.listAlerts({ params: { id: Number(id) } })),
    enabled: !!id,
    refetchInterval: 60_000,
  });

  const ackMutation = useMutation({
    mutationFn: (alertId: number) =>
      runApi((client) =>
        client.watches.acknowledgeAlert({ params: { id: Number(id), alertId } }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watch-alerts", id] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  const ackAllMutation = useMutation({
    mutationFn: () =>
      runApi((client) => client.watches.acknowledgeAllAlerts({ params: { id: Number(id) } })),
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
      alertId: number;
    }) =>
      runApi((client) =>
        client.download.download({
          payload: {
            items: vars.items,
            subfolder: vars.subfolder,
            newFolder: vars.newFolder,
          },
        }),
      ),
    onSuccess: (data, { alertId }) => {
      queryClient.invalidateQueries({ queryKey: ["copyparty-folders"] });
      runApi((client) =>
        client.watches.acknowledgeAlert({ params: { id: Number(id), alertId } }),
      );
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
    <main className="page-wrap sm:px-4 pb-8 pt-8">
      <PageHeader
        numeral="IV"
        label="Watches"
        title={watchQuery.data?.name ?? "Watch"}
        meta={alertsQuery.data ? `${alerts.length} alerts` : undefined}
      />

      <div className="mb-6 flex items-center gap-3">
        <button
          className="text-sm text-secondary hover:text-primary"
          onClick={() => navigate("/watches")}
        >
          &larr; Back
        </button>
      </div>

      {watchQuery.isLoading && (
        <p className="text-sm text-secondary">Loading watch...</p>
      )}

      {watchQuery.isError && (
        <div className="island-shell mb-6 rounded-2xl border-red-200 p-4 text-sm text-red-600">
          Failed to load watch.
        </div>
      )}

      {watchQuery.data && (
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-secondary mt-1">
                Query:{" "}
                <code className="text-xs bg-surface px-1.5 py-0.5 rounded">
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
                      className="text-xs bg-surface border border-border rounded-full px-2 py-0.5 text-secondary"
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
        <h2 className="text-lg font-semibold text-primary">
          Alerts
          {unacknowledgedCount > 0 && (
            <span className="ml-2 text-sm font-normal text-accent">
              ({unacknowledgedCount} new)
            </span>
          )}
        </h2>
        {unacknowledgedCount > 0 && (
          <button
            className="text-xs text-accent hover:text-accent-hover"
            onClick={() => ackAllMutation.mutate()}
            disabled={ackAllMutation.isPending}
          >
            Acknowledge All
          </button>
        )}
      </div>

      {alertsQuery.isLoading && (
        <p className="text-sm text-secondary">Loading alerts...</p>
      )}

      {alertsQuery.isError && (
        <div className="island-shell mb-6 rounded-2xl border-red-200 p-4 text-sm text-red-600">
          Failed to load alerts.
        </div>
      )}

      {alerts.length === 0 && (
        <div className="blank-page flex flex-col items-center gap-3 p-8 text-center">
          <div className="blank-page-icon" />
          <p className="font-display text-lg italic text-primary">No alerts yet</p>
          <p className="text-sm text-secondary">
            Alerts appear here when new Prowlarr results match your filters.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`island-shell rounded-2xl p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${
              alert.acknowledged ? "opacity-50" : ""
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-primary break-words">
                {alert.title}
              </p>
              <p className="text-xs text-secondary mt-0.5">
                {alert.indexer} · {alert.seeders} seeders ·{" "}
                {formatSize(alert.size)} ·{" "}
                {new Date(alert.matchedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2 sm:ml-3 sm:shrink-0">
              <button
                className="text-xs text-accent hover:text-accent/80 px-2 py-1 rounded-lg hover:bg-surface transition-colors"
                onClick={() => setModalItems([alertToProwlarrResult(alert)])}
              >
                Download
              </button>
              {!alert.acknowledged && (
                <button
                  className="text-xs text-secondary hover:text-primary px-2 py-1 rounded-lg hover:bg-surface transition-colors"
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
