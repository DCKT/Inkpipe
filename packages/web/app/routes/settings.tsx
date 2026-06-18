import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SettingsForm from "../components/SettingsForm";
import { api } from "../hooks/useApiClient";
import type { AppConfig } from "../lib/types";
import { ToastGroup } from "../ui/toast";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const komgaNotConfigured = searchParams.get("komgaNotConfigured") === "true";

  const configQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get("settings").json<AppConfig>(),
  });

  const saveMutation = useMutation({
    mutationFn: (config: AppConfig) => api.post("settings", { json: config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      ToastGroup.create.success("Settings saved successfully.");
    },
    onError: (err) => {
      ToastGroup.create.error("Failed to save settings", err.message);
    },
  });

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <h1 className="display-title mb-6 text-3xl font-bold text-[var(--sea-ink)]">
        Settings
      </h1>

      {komgaNotConfigured && (
        <div className="island-shell mb-6 rounded-2xl border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Komga is not configured yet. Please enter your Komga URL and API key below.
        </div>
      )}

      {configQuery.isLoading && (
        <p className="text-sm text-[var(--sea-ink-soft)]">Loading settings...</p>
      )}

      {configQuery.isError && (
        <div className="island-shell mb-6 rounded-2xl border-red-200 p-4 text-sm text-red-600">
          Failed to load settings: {configQuery.error.message}
        </div>
      )}

      {configQuery.data && (
        <SettingsForm
          config={configQuery.data}
          onSave={(config) => saveMutation.mutate(config)}
          isSaving={saveMutation.isPending}
        />
      )}
    </main>
  );
}
