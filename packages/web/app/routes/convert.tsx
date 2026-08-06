import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, RefreshCw } from "lucide-react";
import { api } from "../hooks/useApiClient";
import FileDrop from "../components/FileDrop";
import KccOptionsFields from "../components/KccOptionsFields";
import { PageHeader } from "../components/PageHeader";
import type { AppConfig, KccConfig } from "../lib/types";
import { Button } from "../ui/button";
import { ToastGroup } from "../ui/toast";

type Stage = "idle" | "processing" | "done" | "error";
type SubStage = "uploading" | "converting";

function isDefaultKcc(a: KccConfig, b: KccConfig): boolean {
  return (Object.keys(b) as (keyof KccConfig)[]).every((key) => a[key] === b[key]);
}

export default function ConvertPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("idle");
  const [subStage, setSubStage] = useState<SubStage>("uploading");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string | null>(null);
  const [defaultKcc, setDefaultKcc] = useState<KccConfig | null>(null);
  const [overrides, setOverrides] = useState<KccConfig | null>(null);

  useEffect(() => {
    api.get("settings").json<AppConfig>().then((config) => {
      if (!config.kcc.dockerImage) {
        navigate("/settings");
        return;
      }
      setDefaultKcc(config.kcc);
      setOverrides(config.kcc);
    }).catch(() => {});
  }, [navigate]);

  const handleFile = useCallback(async (file: File) => {
    setStage("processing");
    setSubStage("uploading");
    setError(null);
    setDownloadUrl(null);
    setDownloadFilename(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (overrides) {
        formData.append("options", JSON.stringify(overrides));
      }

      const { id } = await api.post("convert/start", { body: formData }).json<{ id: string }>();

      setSubStage("converting");

      const filename = await new Promise<string>((resolve, reject) => {
        const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";
        const es = new EventSource(`${API_BASE}/api/convert/progress?id=${encodeURIComponent(id)}`);

        es.onerror = () => {
          es.close();
          reject(new Error("Connection lost during conversion"));
        };

        es.addEventListener("done", (e) => {
          es.close();
          resolve((JSON.parse(e.data) as { message: string }).message);
        });

        es.addEventListener("error", (e) => {
          es.close();
          reject(new Error((JSON.parse((e as MessageEvent).data) as { message: string }).message));
        });
      });

      const dlUrl = `/api/convert/download?id=${encodeURIComponent(id)}`;
      setDownloadUrl(dlUrl);
      setDownloadFilename(filename);

      const blobResponse = await api.get("convert/download", { searchParams: { id } });
      const blob = await blobResponse.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);

      setStage("done");
      ToastGroup.create.success("Conversion complete", filename);

      setTimeout(() => {
        setStage("idle");
        setDownloadUrl(null);
        setDownloadFilename(null);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStage("error");
      ToastGroup.create.error("Conversion failed", message);
    }
  }, [overrides]);

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <PageHeader numeral="V" label="Convert" title="Convert CBZ to EPUB" />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <fieldset className="island-shell rounded-2xl p-6">
          <legend className="island-kicker mb-3 px-1">KCC Options</legend>
          {overrides && (
            <>
              <KccOptionsFields
                value={overrides}
                onChange={(patch) => setOverrides({ ...overrides, ...patch })}
                excludeDockerImage
              />
              <Button
                type="button"
                variant="refresh"
                className="mt-4 w-full"
                disabled={!defaultKcc || isDefaultKcc(overrides, defaultKcc)}
                onClick={() => defaultKcc && setOverrides(defaultKcc)}
              >
                Reset to defaults
              </Button>
            </>
          )}
        </fieldset>

        <div>
          {stage === "idle" && (
            <FileDrop onFile={handleFile} disabled={stage !== "idle"} />
          )}

          {stage === "processing" && (
            <div className="island-shell rounded-2xl p-8 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="text-sm font-medium text-primary">
                {subStage === "uploading" ? "Uploading..." : "Converting with KCC..."}
              </p>
              <p className="mt-1 text-xs text-secondary">
                {subStage === "uploading"
                  ? "Sending file to the server"
                  : "This may take a minute"}
              </p>
            </div>
          )}

          {stage === "done" && (
            <div className="island-shell rounded-2xl border-success p-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <ArrowDown size={20} className="text-success" />
              </div>
              <p className="text-sm font-semibold text-primary">
                Download started &mdash; {downloadFilename}
              </p>
              {downloadUrl && (
                <p className="mt-2 text-xs text-secondary">
                  If the download didn&rsquo;t start,{" "}
                  <a href={downloadUrl} className="text-accent-hover underline">
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
        </div>
      </div>
    </main>
  );
}
