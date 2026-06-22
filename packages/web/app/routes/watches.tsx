import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../hooks/useApiClient"
import type { Watch } from "../lib/types"
import { ToastGroup } from "../ui/toast"
import { WatchFormDialog } from "../components/WatchForm"
import { useNavigate } from "react-router-dom"
import { usePushSubscription } from "../hooks/usePushSubscription"

export default function WatchesPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const unreadQuery = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => api.get("watches/unread-count").json<{ count: number }>(),
    refetchInterval: 30_000,
  })

  const watchesQuery = useQuery({
    queryKey: ["watches"],
    queryFn: () => api.get("watches").json<{ watches: Watch[] }>(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`watches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watches"] })
      queryClient.invalidateQueries({ queryKey: ["unread-count"] })
      ToastGroup.create.success("Watch deleted")
    },
    onError: (err) => {
      ToastGroup.create.error("Failed to delete watch", err.message)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.put(`watches/${id}`, { json: { enabled } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watches"] })
    },
  })

  const push = usePushSubscription()

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)]">
          Watches
        </h1>
        <WatchFormDialog
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ["watches"] })
          }}
        />
      </div>

      {push.status === "subscribed" && (
        <div className="island-shell mb-4 rounded-2xl border-[var(--chip-line)] p-3 text-sm text-[var(--sea-ink-soft)] flex items-center justify-between">
          <span>Notifications on</span>
          <button
            className="text-xs text-[var(--sea-ink-soft)] hover:text-red-500 transition-colors"
            onClick={() => push.unsubscribe()}
          >
            Turn off
          </button>
        </div>
      )}

      {push.status === "default" && (
        <div className="island-shell mb-4 rounded-2xl border-[var(--chip-line)] p-3 text-sm flex items-center justify-between">
          <span className="text-[var(--sea-ink-soft)]">Get notified when new matches are found</span>
          <button
            className="rounded-full px-4 py-1.5 text-xs font-medium bg-[var(--lagoon)] text-white hover:bg-[var(--lagoon)]/90 transition-colors"
            onClick={() => push.subscribe()}
          >
            Enable alerts
          </button>
        </div>
      )}

      {push.status === "denied" && (
        <div className="island-shell mb-4 rounded-2xl border-[var(--chip-line)] p-3 text-sm text-[var(--sea-ink-soft)]">
          Notifications blocked. Allow them in your browser settings to receive alerts.
        </div>
      )}

      {unreadQuery.data && unreadQuery.data.count > 0 && (
        <div className="island-shell mb-4 rounded-2xl border-[var(--chip-line)] p-3 text-sm text-[var(--lagoon)]">
          {unreadQuery.data.count} unread alert{unreadQuery.data.count !== 1 ? "s" : ""}
        </div>
      )}

      {watchesQuery.isLoading && (
        <p className="text-sm text-[var(--sea-ink-soft)]">Loading watches...</p>
      )}

      {watchesQuery.isError && (
        <div className="island-shell mb-6 rounded-2xl border-red-200 p-4 text-sm text-red-600">
          Failed to load watches: {watchesQuery.error.message}
        </div>
      )}

      {watchesQuery.data && watchesQuery.data.watches.length === 0 && (
        <div className="island-shell rounded-2xl p-8 text-center">
          <p className="text-sm text-[var(--sea-ink-soft)]">
            No watches configured yet. Create one to monitor Prowlarr for new content.
          </p>
        </div>
      )}

      {watchesQuery.data && watchesQuery.data.watches.length > 0 && (
        <div className="space-y-3">
          {watchesQuery.data.watches.map((watch) => (
            <div
              key={watch.id}
              className="island-shell rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--link-bg-hover)]"
              onClick={() => navigate(String(watch.id))}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--sea-ink)] truncate">
                    {watch.name}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${watch.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {watch.enabled ? "Active" : "Paused"}
                  </span>
                </div>
                <p className="text-xs text-[var(--sea-ink-soft)] mt-0.5 truncate">
                  Query: {watch.query} · Every {watch.intervalSeconds}s
                  {watch.filterGroups.length > 0 && (
                    <> · {watch.filterGroups.length} filter group{watch.filterGroups.length !== 1 ? "s" : ""}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                <button
                  className="text-xs text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] px-2 py-1 rounded-lg hover:bg-[var(--chip-bg)] transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleMutation.mutate({ id: watch.id, enabled: !watch.enabled })
                  }}
                >
                  {watch.enabled ? "Pause" : "Resume"}
                </button>
                <button
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete watch "${watch.name}" and all its alerts?`)) {
                      deleteMutation.mutate(watch.id)
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
