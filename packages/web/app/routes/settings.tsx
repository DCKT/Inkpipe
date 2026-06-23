import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SettingsForm from "../components/SettingsForm";
import { api } from "../hooks/useApiClient";
import type { AppConfig } from "../lib/types";
import { Button } from "../ui/button";
import { ToastGroup } from "../ui/toast";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const komgaNotConfigured = searchParams.get("komgaNotConfigured") === "true";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formKey, setFormKey] = useState(0);

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

  const handleExport = async () => {
    try {
      const res = await api.get("settings/export");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="?([^"]+)"?/);
      a.download = filenameMatch?.[1] ?? "inkpipe-settings.json";
      a.click();
      URL.revokeObjectURL(url);
      ToastGroup.create.success("Settings exported successfully.");
    } catch (err) {
      ToastGroup.create.error(
        "Failed to export settings",
        (err as Error).message,
      );
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      await api
        .post("settings/import", { json: config })
        .json<{ success?: boolean; error?: string }>()
        .then((data) => {
          if (data.error) throw new Error(data.error);
        });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setFormKey((k) => k + 1);
      ToastGroup.create.success("Settings imported successfully.");
    } catch (err) {
      ToastGroup.create.error(
        "Failed to import settings",
        (err as Error).message,
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="display-title text-3xl font-bold text-primary">
          Settings
        </h1>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={handleExport}>
            Export Settings
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Import Settings
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {komgaNotConfigured && (
        <div className="island-shell mb-6 rounded-2xl border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Komga is not configured yet. Please enter your Komga URL and API key
          below.
        </div>
      )}

      {configQuery.isLoading && (
        <p className="text-sm text-secondary">
          Loading settings...
        </p>
      )}

      {configQuery.isError && (
        <div className="island-shell mb-6 rounded-2xl border-red-200 p-4 text-sm text-red-600">
          Failed to load settings: {configQuery.error.message}
        </div>
      )}

      {configQuery.data && (
        <SettingsForm
          key={formKey}
          config={configQuery.data}
          onSave={(config) => saveMutation.mutate(config)}
          isSaving={saveMutation.isPending}
        />
      )}
    </main>
  );
}
