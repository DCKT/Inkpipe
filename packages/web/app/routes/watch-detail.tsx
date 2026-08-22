import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { alertToProwlarrResult } from "@inkpipe/shared";
import { runApi } from "../lib/apiClient";
import type { WatchAlert } from "../lib/types";
import { ToastGroup } from "../ui/toast";
import { WatchFormDialog } from "../components/WatchForm";
import { PageHeader } from "../components/PageHeader";

export default function WatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  // Book watches (a folder assigned) go through the full pipeline into that
  // folder; non-book watches only get their magnet saved to AllDebrid.
  // `watch.subfolder` is the same discriminant the Telegram buttons use.
  const downloadMutation = useMutation({
    mutationFn: (alert: WatchAlert) =>
      runApi((client) =>
        client.download.download({
          payload: {
            items: [alertToProwlarrResult(alert)],
            subfolder: watchQuery.data?.subfolder ?? undefined,
          },
        }),
      ),
    onSuccess: (data, alert) => {
      queryClient.invalidateQueries({ queryKey: ["copyparty-folders"] });
      runApi((client) =>
        client.watches.acknowledgeAlert({ params: { id: Number(id), alertId: alert.id } }),
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

  const saveMagnetMutation = useMutation({
    mutationFn: (alert: WatchAlert) =>
      runApi((client) =>
        client.alldebrid.saveMagnet({
          payload: { magnetUrl: alert.magnetUrl, downloadUrl: alert.downloadUrl },
        }),
      ),
    onSuccess: (_data, alert) => {
      runApi((client) =>
        client.watches.acknowledgeAlert({ params: { id: Number(id), alertId: alert.id } }),
      );
      queryClient.invalidateQueries({ queryKey: ["watch-alerts", id] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
      ToastGroup.create.success("Saved to AllDebrid");
    },
    onError: (err) => {
      ToastGroup.create.error("Failed to save to AllDebrid", err.message);
    },
  });

  const alerts = alertsQuery.data?.alerts ?? [];
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;
  const isBookWatch = !!watchQuery.data?.subfolder;

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
                {" · "}
                {watchQuery.data.subfolder ? (
                  <>
                    Downloads to{" "}
                    <code className="text-xs bg-surface px-1.5 py-0.5 rounded">
                      {decodeURIComponent(watchQuery.data.subfolder)}
                    </code>
                  </>
                ) : (
                  "Saves matches to AllDebrid"
                )}
              </p>
              {watchQuery.data.filterGroups.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {watchQuery.data.filterGroups.map((g, gi) => (
                    <span key={gi} className="flex items-center gap-1.5">
                      {gi > 0 && (
                        <span className="text-[10px] font-bold tracking-wide text-secondary">
                          AND
                        </span>
                      )}
                      <span
                        className="text-xs bg-surface border border-border rounded-full px-2 py-0.5 text-secondary"
                        title={
                          g.substrings.length > 1
                            ? g.mode === "AND"
                              ? "Every substring below must be present"
                              : "Any one substring below is enough"
                            : undefined
                        }
                      >
                        {g.substrings.length > 1 &&
                          `${g.mode === "AND" ? "ALL" : "ANY"} of: `}
                        {g.substrings.join(
                          g.mode === "AND" ? " + " : " / ",
                        )}
                      </span>
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
              {isBookWatch ? (
                <button
                  className="text-xs text-accent hover:text-accent/80 px-2 py-1 rounded-lg hover:bg-surface transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  onClick={() => downloadMutation.mutate(alert)}
                  disabled={downloadMutation.isPending}
                >
                  Download
                </button>
              ) : (
                <button
                  className="text-xs text-accent hover:text-accent/80 px-2 py-1 rounded-lg hover:bg-surface transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  onClick={() => saveMagnetMutation.mutate(alert)}
                  disabled={saveMagnetMutation.isPending || (!alert.magnetUrl && !alert.downloadUrl)}
                  title={!alert.magnetUrl && !alert.downloadUrl ? "No magnet or download URL for this alert" : undefined}
                >
                  Save to Magnet
                </button>
              )}
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
