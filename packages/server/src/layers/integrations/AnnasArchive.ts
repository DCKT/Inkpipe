import { Context, Effect, Layer } from "effect";
import * as cheerio from "cheerio";
import {
  type AnnasArchiveResult,
  AnnasArchiveNotConfigured,
  AnnasArchiveHttpError,
  AnnasArchiveDownloadError,
  sortAnnasArchiveResults,
} from "@inkpipe/shared";
import { ConfigService, requireConfigured } from "../core/Config";
import { LogService } from "../core/Log";

interface Logger {
  info: (namespace: string, ...message: unknown[]) => Effect.Effect<void>;
  warn: (namespace: string, ...message: unknown[]) => Effect.Effect<void>;
}

/** Anna's Archive runs the same site on a few interchangeable domains; one can be
 *  seized/blocked while the others work (annas-archive.org was suspended Jan 2026,
 *  .li was deleted Mar 2026 — this list needs occasional updating as domains rotate
 *  under legal pressure). Cap failover at these 3 known mirrors — never retry unbounded. */
const KNOWN_MIRRORS = [
  "https://annas-archive.gl",
  "https://annas-archive.pk",
  "https://annas-archive.gd",
];
export const MAX_MIRROR_ATTEMPTS = KNOWN_MIRRORS.length;

/** User's configured base URL is tried first; remaining known mirrors fill out the rest, capped at MAX_MIRROR_ATTEMPTS. */
function candidateBaseUrls(configuredBaseUrl: string): string[] {
  const normalized = (configuredBaseUrl || KNOWN_MIRRORS[0]).replace(
    /\/+$/,
    "",
  );
  const rest = KNOWN_MIRRORS.filter((m) => m !== normalized);
  return [normalized, ...rest].slice(0, MAX_MIRROR_ATTEMPTS);
}

/** An error that will fail identically on every mirror (bad key, no membership) — not worth retrying. */
class NonRetryableError extends Error {}

/** Runs `attempt` against each candidate base URL in turn, stopping at the first success. */
async function withMirrorFallback<T>(
  configuredBaseUrl: string,
  log: Logger,
  logNamespace: string,
  attempt: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const candidates = candidateBaseUrls(configuredBaseUrl);
  let lastError: Error | null = null;
  for (const baseUrl of candidates) {
    try {
      return await attempt(baseUrl);
    } catch (e) {
      if (e instanceof NonRetryableError) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
      Effect.runSync(
        log.warn(
          logNamespace,
          `Request to ${baseUrl} failed: ${lastError.message}`,
        ),
      );
    }
  }
  throw lastError ?? new Error("All Anna's Archive mirrors failed");
}

export class AnnasArchiveService extends Context.Service<
  AnnasArchiveService,
  {
    readonly search: (
      query: string,
    ) => Effect.Effect<AnnasArchiveResult[], AnnasArchiveHttpError>;
    readonly getDownloadUrl: (
      md5: string,
    ) => Effect.Effect<
      string,
      AnnasArchiveNotConfigured | AnnasArchiveHttpError
    >;
    readonly downloadFile: (
      url: string,
      destPath: string,
      onProgress?: (received: number, total: number) => void,
    ) => Effect.Effect<void, AnnasArchiveDownloadError>;
  }
>()("AnnasArchiveService") {}

export const AnnasArchiveServiceLive = Layer.effect(
  AnnasArchiveService,
  Effect.gen(function* () {
    const configService = yield* ConfigService;
    const log = yield* LogService;

    // Search does not require a member key — it works the same as browsing
    // Anna's Archive's search page anonymously.
    const search = (query: string) =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.orElseSucceed(() => ({
            annasArchive: { apiKey: "", baseUrl: "https://annas-archive.gl" },
          })),
        );
        const baseUrl =
          config.annasArchive.baseUrl || "https://annas-archive.gl";

        return yield* Effect.tryPromise({
          try: () => doAnnasArchiveSearch(baseUrl, query, log),
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e);
            return new AnnasArchiveHttpError({
              message: `Anna's Archive search failed: ${message}`,
            });
          },
        });
      });

    // Downloads require a paid member key (Anna's Archive's one documented JSON API).
    const getDownloadUrl = (md5: string) =>
      Effect.gen(function* () {
        const { apiKey, baseUrl } = yield* requireConfigured(
          configService,
          (c) => c.annasArchive,
          (a) => a.apiKey.length > 0,
          "Anna's Archive API key is not configured",
          (message) => new AnnasArchiveNotConfigured({ message }),
        );

        return yield* Effect.tryPromise({
          try: () =>
            doGetDownloadUrl(
              baseUrl || "https://annas-archive.gl",
              apiKey,
              md5,
              log,
            ),
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e);
            return new AnnasArchiveHttpError({
              message: `Anna's Archive download link failed: ${message}`,
            });
          },
        });
      });

    const downloadFile = (
      url: string,
      destPath: string,
      onProgress?: (received: number, total: number) => void,
    ) =>
      Effect.tryPromise({
        try: () => downloadSingle(url, destPath, log, onProgress),
        catch: (e) => {
          const message = e instanceof Error ? e.message : String(e);
          return new AnnasArchiveDownloadError({
            message: `Download failed: ${message}`,
          });
        },
      });

    return { search, getDownloadUrl, downloadFile };
  }),
);

// Anna's Archive has no JSON search API — its own FAQ says the only stable
// JSON endpoint is fast_download.json, and points people at ElasticSearch/
// MariaDB DB dumps for anything else. Real-world clients (the annas-archive-mcp
// Rust client, the annadl Python script) all get search results by fetching
// /search?q=... and parsing the HTML. Selectors below mirror that client's
// scraper.rs (result row: div.flex.pt-3.pb-3.border-b; md5 link: a[href^="/md5/"];
// title: a.js-vim-focus; metadata line "FORMAT · SIZE · LANGUAGE [code] · YEAR"
// in div.text-gray-800.font-semibold.text-sm). Fragile: breaks if Anna's Archive
// changes their markup.
async function doAnnasArchiveSearch(
  configuredBaseUrl: string,
  query: string,
  log: Logger,
): Promise<AnnasArchiveResult[]> {
  return withMirrorFallback(
    configuredBaseUrl,
    log,
    "annas-archive",
    async (baseUrl) => {
      const url = new URL("/search", baseUrl);
      url.searchParams.set("q", query);
      Effect.runSync(
        log.info("annas-archive", `Searching (${baseUrl}):`, query),
      );
      const response = await fetch(url.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Inkpipe)" },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const html = await response.text();
      const results = parseSearchResults(html);
      // A substantial page with zero parsed rows most likely means Anna's Archive
      // changed their markup and our scraper selectors no longer match anything —
      // as opposed to a query that genuinely has no results (which still renders a
      // non-trivial "no results" page, but real result pages are much larger).
      if (results.length === 0 && html.length > 20000) {
        Effect.runSync(
          log.warn(
            "annas-archive",
            `Search for "${query}" returned a large page (${html.length} bytes) but parsed 0 results — the scraper's selectors may be out of date`,
          ),
        );
      }
      return sortAnnasArchiveResults(results);
    },
  );
}

function parseSearchResults(html: string): AnnasArchiveResult[] {
  const $ = cheerio.load(html);
  const results: AnnasArchiveResult[] = [];

  $("div.flex.pt-3.pb-3.border-b").each((_, el) => {
    const row = $(el);

    const md5 = row
      .find('a[href^="/md5/"]')
      .first()
      .attr("href")
      ?.replace(/^\/md5\//, "");
    if (!md5) return;

    const title = row.find("a.js-vim-focus").first().text().trim();
    if (!title) return;

    let author: string | null = null;
    row.find("a").each((_, a) => {
      if ($(a).find('span[class*="mdi--user-edit"]').length > 0) {
        const text = $(a).text().trim();
        if (text) author = text;
        return false;
      }
    });

    const metadataEl = row
      .find("div.text-gray-800.font-semibold.text-sm")
      .first()
      .clone();
    metadataEl.find("script").remove();
    const metadataText = metadataEl.text();

    let extension: string | null = null;
    let size: string | null = null;
    let language: string | null = null;
    const KNOWN_FORMATS = new Set([
      "pdf",
      "epub",
      "mobi",
      "azw3",
      "djvu",
      "cbr",
      "cbz",
      "fb2",
      "txt",
      "doc",
      "docx",
      "rtf",
    ]);
    for (const rawPart of metadataText.split("·")) {
      const part = rawPart.trim();
      const lower = part.toLowerCase();
      if (KNOWN_FORMATS.has(lower)) {
        extension = lower;
      } else if (/^[\d.]+\s*(gb|mb|kb|b)$/i.test(part.replace(/\s+/g, ""))) {
        size = part;
      } else if (part.includes("[") && part.includes("]")) {
        language = part;
      }
    }

    const coverUrl = row.find("img").first().attr("src")?.trim() || null;

    results.push({ md5, title, author, extension, size, language, coverUrl });
  });

  return results;
}

async function doGetDownloadUrl(
  configuredBaseUrl: string,
  apiKey: string,
  md5: string,
  log: Logger,
): Promise<string> {
  return withMirrorFallback(
    configuredBaseUrl,
    log,
    "annas-archive",
    async (baseUrl) => {
      const url = new URL("/dyn/api/fast_download.json", baseUrl);
      url.searchParams.set("md5", md5);
      url.searchParams.set("path_index", "0");
      url.searchParams.set("domain_index", "0");
      url.searchParams.set("key", apiKey);
      Effect.runSync(
        log.info(
          "annas-archive",
          `Resolving download URL (${baseUrl}) for md5: ${md5}`,
        ),
      );
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(30000),
      });
      const bodyText = await response.text();
      if (!response.ok) {
        if (bodyText.includes("no_membership")) {
          throw new NonRetryableError(
            "Anna's Archive account has no active membership",
          );
        }
        if (bodyText.includes("invalid")) {
          throw new NonRetryableError("Invalid Anna's Archive API key");
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = JSON.parse(bodyText) as {
        download_url?: string;
        error?: string;
      };
      if (data.error) {
        throw new Error(data.error);
      }
      if (!data.download_url) {
        throw new Error("No download_url in Anna's Archive response");
      }
      return data.download_url;
    },
  );
}

const KNOWN_EXTENSIONS = new Set([
  "pdf",
  "epub",
  "mobi",
  "azw3",
  "djvu",
  "cbr",
  "cbz",
  "fb2",
  "txt",
  "doc",
  "docx",
  "rtf",
]);

/**
 * Fallback for when the search page's metadata line didn't carry a recognizable
 * format (result.extension is null): most fast-download mirror URLs still end
 * in the real file extension, so try to recover it from the resolved URL
 * before giving up and calling the file `.bin`.
 */
export function guessExtensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = /\.([a-z0-9]+)$/i.exec(pathname);
    const ext = match?.[1]?.toLowerCase();
    return ext && KNOWN_EXTENSIONS.has(ext) ? ext : null;
  } catch {
    return null;
  }
}

async function downloadSingle(
  url: string,
  destPath: string,
  log: Logger,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  Effect.runSync(log.info("annas-archive", `Downloading to: ${destPath}`));
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }
  const total = Number(response.headers.get("content-length") ?? 0);
  const chunks: Uint8Array[] = [];
  const reader = response.body!.getReader();
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    onProgress?.(received, total);
    chunks.push(value);
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  await Bun.write(destPath, buffer);
  Effect.runSync(
    log.info(
      "annas-archive",
      `Download complete: ${destPath} (${received} bytes)`,
    ),
  );
}
