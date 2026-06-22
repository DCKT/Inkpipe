import { useState } from "react";
import { api } from "../hooks/useApiClient";
import { usePushSubscription } from "../hooks/usePushSubscription";

interface EndpointDef {
  group: string;
  label: string;
  method: string;
  path: string;
  /** Query param key, or null for no query params */
  queryKey?: string | null;
  /** Body field name placeholder, or null for no body */
  bodyKey?: string | null;
  /** If true, response is binary — show metadata not body */
  binary?: boolean;
  /** If true, visually marks as mutation */
  mutating?: boolean;
}

const ENDPOINTS: EndpointDef[] = [
  // --- Search ---
  {
    group: "Search",
    label: "Search",
    method: "GET",
    path: "/api/search",
    queryKey: "q",
  },
  { group: "Search", label: "Latest", method: "GET", path: "/api/latest" },

  // --- Komga ---
  {
    group: "Komga",
    label: "Libraries",
    method: "GET",
    path: "/api/komga/libraries",
  },
  {
    group: "Komga",
    label: "Series",
    method: "POST",
    path: "/api/komga/series",
    bodyKey: "libraryId",
  },
  {
    group: "Komga",
    label: "Thumbnail",
    method: "GET",
    path: "/api/komga/thumbnail",
    queryKey: "seriesId",
    binary: true,
  },
  {
    group: "Komga",
    label: "Books",
    method: "POST",
    path: "/api/komga/books",
    bodyKey: "seriesId",
  },

  // --- Copyparty ---
  {
    group: "Copyparty",
    label: "List Folders",
    method: "GET",
    path: "/api/copyparty/folders",
  },
  {
    group: "Copyparty",
    label: "Create Folder",
    method: "POST",
    path: "/api/copyparty/folders",
    bodyKey: "name",
    mutating: true,
  },
  {
    group: "Copyparty",
    label: "Delete Folder",
    method: "DELETE",
    path: "/api/copyparty/folders",
    bodyKey: "name",
    mutating: true,
  },

  // --- Convert ---
  {
    group: "Convert",
    label: "Download",
    method: "GET",
    path: "/api/convert",
    queryKey: "id",
    binary: true,
  },

  // --- Settings ---
  {
    group: "Settings",
    label: "Get Config",
    method: "GET",
    path: "/api/settings",
  },

  // --- Jobs ---
  { group: "Jobs", label: "List Jobs", method: "GET", path: "/api/jobs" },

  // --- Push ---
  {
    group: "Push",
    label: "VAPID Public Key",
    method: "GET",
    path: "/api/push/vapid-public-key",
  },
  {
    group: "Push",
    label: "Subscribe",
    method: "POST",
    path: "/api/push/subscribe",
    bodyKey: "subscription",
    mutating: true,
  },
];

function groupEndpoints(endpoints: EndpointDef[]): Map<string, EndpointDef[]> {
  const map = new Map<string, EndpointDef[]>();
  for (const ep of endpoints) {
    const existing = map.get(ep.group) ?? [];
    existing.push(ep);
    map.set(ep.group, existing);
  }
  return map;
}

function methodColor(method: string): string {
  switch (method) {
    case "GET":
      return "text-green-600";
    case "POST":
      return "text-amber-600";
    case "DELETE":
      return "text-red-600";
    default:
      return "text-[var(--sea-ink)]";
  }
}

function prettyJson(value: unknown, spaces: number = 2): string {
  try {
    return JSON.stringify(value, null, spaces);
  } catch {
    return String(value);
  }
}

export default function DebugPage() {
  if (import.meta.env.PROD) {
    return (
      <main className="page-wrap px-4 pb-8 pt-8">
        <h1 className="display-title mb-6 text-3xl font-bold text-[var(--sea-ink)]">
          Debug
        </h1>
        <p className="text-sm text-[var(--sea-ink)]/60">
          The debug page is only available in development mode.
        </p>
      </main>
    );
  }

  const [selected, setSelected] = useState<EndpointDef | null>(null);
  const [queryValue, setQueryValue] = useState("");
  const [bodyValue, setBodyValue] = useState("");
  const [response, setResponse] = useState<{
    status: number;
    headers: Record<string, string>;
    body: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const push = usePushSubscription()
  const [pushTestResult, setPushTestResult] = useState<string | null>(null)

  const grouped = groupEndpoints(ENDPOINTS);

  const handleSelect = (ep: EndpointDef) => {
    setSelected(ep);
    setQueryValue("");
    setBodyValue(
      ep.bodyKey ? JSON.stringify({ [ep.bodyKey]: "" }, null, 2) : "",
    );
    setResponse(null);
    setError(null);
  };

  const handleSend = async () => {
    if (!selected) return;
    setLoading(true);
    setResponse(null);
    setError(null);

    try {
      const cleanPath = selected.path.replace(/^\/api\/?/, "");
      const searchParams: Record<string, string> = {};
      if (selected.queryKey && queryValue.trim()) {
        searchParams[selected.queryKey] = queryValue.trim();
      }

      let result: Response;

      const fetchOpts: Record<string, unknown> = {
        throwHttpErrors: false,
      };
      if (Object.keys(searchParams).length > 0) {
        fetchOpts.searchParams = searchParams;
      }

      if (selected.method === "GET") {
        result = await api.get(cleanPath, fetchOpts);
      } else {
        let jsonBody: unknown = undefined;
        if (selected.bodyKey && bodyValue.trim()) {
          try {
            jsonBody = JSON.parse(bodyValue);
          } catch {
            setError("Invalid JSON body");
            setLoading(false);
            return;
          }
        } else if (selected.bodyKey) {
          jsonBody = {};
        }
        if (selected.method === "DELETE") {
          result = await api.delete(cleanPath, {
            ...fetchOpts,
            json: jsonBody ?? undefined,
          });
        } else {
          result = await api.post(cleanPath, {
            ...fetchOpts,
            json: jsonBody ?? undefined,
          });
        }
      }

      const headers: Record<string, string> = {};
      result.headers.forEach((v, k) => {
        headers[k] = v;
      });

      if (selected.binary) {
        setResponse({
          status: result.status,
          headers,
          body: `[Binary response: ${headers["content-type"] ?? "unknown type"}, ${headers["content-length"] ?? "unknown"} bytes]`,
        });
      } else {
        const text = await result.text();
        let formatted = text;
        try {
          formatted = prettyJson(JSON.parse(text));
        } catch {
          // not JSON, show raw
        }
        setResponse({
          status: result.status,
          headers,
          body: formatted,
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <h1 className="display-title mb-6 text-3xl font-bold text-[var(--sea-ink)]">
        Debug — API Explorer
      </h1>

      <div className="flex gap-6 h-[calc(100vh-12rem)]">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 overflow-auto island-shell rounded-2xl p-3">
          {[...grouped.entries()].map(([group, eps]) => (
            <div key={group} className="mb-3 last:mb-0">
              <p className="px-2 py-1 text-xs font-semibold text-[var(--sea-ink)]/40 uppercase tracking-wider">
                {group}
              </p>
              {eps.map((ep) => (
                <button
                  key={ep.label}
                  type="button"
                  onClick={() => handleSelect(ep)}
                  className={`w-full rounded-lg px-3 py-1.5 text-left text-sm flex items-center gap-2 transition-colors ${
                    selected?.label === ep.label && selected?.group === ep.group
                      ? "bg-[var(--lagoon)]/15 text-[var(--sea-ink)]"
                      : "text-[var(--sea-ink)]/70 hover:bg-[var(--lagoon)]/8"
                  }`}
                >
                  <span
                    className={`text-[10px] font-mono font-bold shrink-0 w-9 ${methodColor(ep.method)}`}
                  >
                    {ep.method}
                  </span>
                  <span className="truncate">{ep.label}</span>
                  {ep.mutating && (
                    <span className="ml-auto shrink-0 rounded-full bg-red-100 px-1.5 py-px text-[9px] font-semibold text-red-600">
                      MUT
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </aside>

        {/* Main panel */}
        <div className="flex-1 flex flex-col gap-4 overflow-auto">
          {!selected ? (
            <div className="island-shell rounded-2xl p-8 text-center text-sm text-[var(--sea-ink)]/50 flex-1 flex items-center justify-center">
              Select an endpoint from the sidebar to get started.
            </div>
          ) : (
            <>
              {/* Request form */}
              <div className="island-shell rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${methodColor(selected.method)} bg-current/10`}
                  >
                    {selected.method}
                  </span>
                  <span className="text-sm text-[var(--sea-ink)]">
                    {selected.path}
                  </span>
                  {selected.mutating && (
                    <span className="rounded-full bg-red-100 px-2 py-px text-[10px] font-semibold text-red-600">
                      Mutation
                    </span>
                  )}
                </div>

                {selected.queryKey && (
                  <div className="mb-3">
                    <label className="block mb-1 text-xs font-medium text-[var(--sea-ink)]/60">
                      {selected.queryKey}
                    </label>
                    <input
                      type="text"
                      value={queryValue}
                      onChange={(e) => setQueryValue(e.target.value)}
                      placeholder={`Enter ${selected.queryKey}...`}
                      className="w-full rounded-lg border border-[rgba(114,135,253,0.3)] bg-white/20 px-3 py-2 text-sm text-[var(--sea-ink)] placeholder-[var(--sea-ink)]/40 outline-none focus:border-[var(--lagoon)] focus:ring-1 focus:ring-[var(--lagoon)]"
                    />
                  </div>
                )}

                {selected.bodyKey && (
                  <div className="mb-3">
                    <label className="block mb-1 text-xs font-medium text-[var(--sea-ink)]/60">
                      Body (JSON) — {"{"}"{selected.bodyKey}": "..."{"}"}
                    </label>
                    <textarea
                      value={bodyValue}
                      onChange={(e) => setBodyValue(e.target.value)}
                      rows={6}
                      className="w-full rounded-lg border border-[rgba(114,135,253,0.3)] bg-white/20 px-3 py-2 text-sm font-mono text-[var(--sea-ink)] placeholder-[var(--sea-ink)]/40 outline-none focus:border-[var(--lagoon)] focus:ring-1 focus:ring-[var(--lagoon)]"
                      spellCheck={false}
                    />
                  </div>
                )}

                {!selected.queryKey && !selected.bodyKey && (
                  <p className="text-xs text-[var(--sea-ink)]/40 mb-3">
                    No parameters required.
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={loading}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                    loading
                      ? "bg-[var(--lagoon)]/30 text-[var(--sea-ink)]/40 cursor-not-allowed"
                      : "bg-[var(--lagoon)] text-white hover:bg-[var(--lagoon)]/90"
                  }`}
                >
                  {loading ? "Sending..." : "Send"}
                </button>
              </div>

              {/* Response */}
              <div className="island-shell rounded-2xl p-4 flex-1 overflow-auto">
                <h2 className="text-sm font-semibold text-[var(--sea-ink)] mb-3">
                  Response
                </h2>

                {loading && (
                  <p className="text-sm text-[var(--sea-ink)]/50">Loading...</p>
                )}

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                {response && !loading && (
                  <div>
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                          response.status >= 200 && response.status < 300
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {response.status}
                      </span>
                      <span className="text-xs text-[var(--sea-ink)]/50">
                        {response.headers["content-type"] ?? "unknown"}
                      </span>
                    </div>
                    <pre className="text-xs font-mono text-[var(--sea-ink)]/80 whitespace-pre-wrap break-all bg-[var(--sea-ink)]/5 rounded-lg p-3 max-h-96 overflow-auto">
                      {response.body}
                    </pre>
                  </div>
                )}

                {!loading && !error && !response && (
                  <p className="text-xs text-[var(--sea-ink)]/40">
                    Send a request to see the response here.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Push Notifications Test Panel */}
      <div className="mt-6 island-shell rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-[var(--sea-ink)] mb-3">
          Push Notifications
        </h2>

        {push.status === "unsupported" && (
          <p className="text-sm text-[var(--sea-ink-soft)]">
            Push notifications are not supported in this browser.
          </p>
        )}

        {push.status !== "unsupported" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--sea-ink-soft)]">Permission:</span>
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                Notification.permission === "granted"
                  ? "bg-green-100 text-green-700"
                  : Notification.permission === "denied"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-600"
              }`}>
                {Notification.permission}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {push.status === "default" && (
                <button
                  type="button"
                  onClick={() => push.subscribe()}
                  className="rounded-full px-4 py-1.5 text-xs font-medium bg-[var(--lagoon)] text-white hover:bg-[var(--lagoon)]/90 transition-colors"
                >
                  Subscribe
                </button>
              )}
              {push.status === "subscribed" && (
                <button
                  type="button"
                  onClick={() => push.unsubscribe()}
                  className="rounded-full px-4 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                >
                  Unsubscribe
                </button>
              )}
              {push.status === "denied" && (
                <p className="text-xs text-[var(--sea-ink-soft)]">
                  Permission denied. Enable notifications in your browser settings.
                </p>
              )}
            </div>

            {push.status === "subscribed" && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.serviceWorker.ready.then((reg) => {
                      reg.showNotification("Inkpipe Test", { body: "This is a test notification from the debug page." })
                      setPushTestResult("Test notification sent")
                      setTimeout(() => setPushTestResult(null), 3000)
                    }).catch(() => {
                      setPushTestResult("Failed to send test notification")
                      setTimeout(() => setPushTestResult(null), 3000)
                    })
                  }}
                  className="rounded-full px-4 py-1.5 text-xs font-medium border border-[var(--chip-line)] text-[var(--sea-ink)] hover:bg-[var(--link-bg-hover)] transition-colors"
                >
                  Send Test Notification
                </button>
                {pushTestResult && (
                  <span className="ml-3 text-xs text-[var(--sea-ink-soft)]">{pushTestResult}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
