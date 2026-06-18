import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, RefreshCw } from "lucide-react";
import { api } from "../hooks/useApiClient";
import FileDrop from "../components/FileDrop";
import type { AppConfig } from "../lib/types";
import { Button } from "../ui/button";
import { ToastGroup } from "../ui/toast";

type Stage = "idle" | "processing" | "done" | "error";
type SubStage = "uploading" | "converting";

export default function ConvertPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("idle");
  const [subStage, setSubStage] = useState<SubStage>("uploading");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string | null>(null);

  useEffect(() => {
    api.get("settings").json<AppConfig>().then((config) => {
      if (!config.kcc.dockerImage) {
        navigate("/settings");
      }
    }).catch(() => {});
  }, [navigate]);

  const handleFile = useCallback(async (file: File) => {
    setStage("processing");
    setSubStage("uploading");
    setError(null);
    setDownloadUrl(null);
    setDownloadFilename(null);

    const convertingTimer = setTimeout(() => {
      setSubStage("converting");
    }, 3000);

    try {
      const formData = new FormData();
      formData.append("file", file);

      clearTimeout(convertingTimer);

      const result = await api.post("convert", { body: formData }).json<{ id: string; filename: string }>();
      setDownloadUrl(`/api/convert?id=${encodeURIComponent(result.id)}`);
      setDownloadFilename(result.filename);

      const blobResponse = await api.get("convert", { searchParams: { id: result.id } });
      const blob = await blobResponse.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      setStage("done");
      ToastGroup.create.success("Conversion complete", result.filename);

      setTimeout(() => {
        setStage("idle");
        setDownloadUrl(null);
        setDownloadFilename(null);
      }, 3000);
    } catch (err) {
      clearTimeout(convertingTimer);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStage("error");
      ToastGroup.create.error("Conversion failed", message);
    }
  }, []);

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <h1 className="display-title mb-6 text-3xl font-bold text-[var(--sea-ink)]">
        Convert CBZ to EPUB
      </h1>

      {stage === "idle" && (
        <FileDrop onFile={handleFile} disabled={stage !== "idle"} />
      )}

      {stage === "processing" && (
        <div className="island-shell rounded-2xl p-8 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--lagoon)] border-t-transparent" />
          <p className="text-sm font-medium text-[var(--sea-ink)]">
            {subStage === "uploading" ? "Uploading..." : "Converting with KCC..."}
          </p>
          <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
            {subStage === "uploading"
              ? "Sending file to the server"
              : "This may take a minute"}
          </p>
        </div>
      )}

      {stage === "done" && (
        <div className="island-shell rounded-2xl border-[var(--palm)] p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(23,146,153,0.12)]">
            <ArrowDown size={20} className="text-[var(--palm)]" />
          </div>
          <p className="text-sm font-semibold text-[var(--sea-ink)]">
            Download started &mdash; {downloadFilename}
          </p>
          {downloadUrl && (
            <p className="mt-2 text-xs text-[var(--sea-ink-soft)]">
              If the download didn&rsquo;t start,{" "}
              <a href={downloadUrl} className="text-[var(--lagoon-deep)] underline">
                click here
              </a>
            </p>
          )}
        </div>
      )}

      {stage === "error" && (
        <div className="island-shell rounded-2xl border-red-200 p-8 text-center">
          <p className="text-sm font-medium text-red-600">Conversion failed</p>
          {error && (
            <p className="mt-1 text-xs text-red-500">{error}</p>
          )}
          <Button
            variant="refresh"
            onClick={() => setStage("idle")}
            className="mt-4 inline-flex items-center gap-2"
          >
            <RefreshCw size={14} />
            Try again
          </Button>
        </div>
      )}
    </main>
  );
}
