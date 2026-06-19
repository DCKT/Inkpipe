import { Layer, ManagedRuntime } from "effect"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { ConfigServiceLive } from "./layers/Config"
import type { ConfigService } from "./layers/Config"
import { JobStoreServiceLive } from "./layers/JobStore"
import type { JobStoreService } from "./layers/JobStore"
import { LogServiceLive } from "./layers/Log"
import type { LogService } from "./layers/Log"
import { ProwlarrServiceLive } from "./layers/Prowlarr"
import type { ProwlarrService } from "./layers/Prowlarr"
import { AllDebridServiceLive } from "./layers/AllDebrid"
import type { AllDebridService } from "./layers/AllDebrid"
import { KomgaServiceLive } from "./layers/Komga"
import type { KomgaService } from "./layers/Komga"
import { CopypartyServiceLive } from "./layers/Copyparty"
import type { CopypartyService } from "./layers/Copyparty"
import { KccServiceLive } from "./layers/Kcc"
import type { KccService } from "./layers/Kcc"
import { FileManagerServiceLive } from "./layers/FileManager"
import type { FileManagerService } from "./layers/FileManager"
import { PipelineServiceLive } from "./layers/Pipeline"
import type { PipelineService } from "./layers/Pipeline"
import { WatchStoreServiceLive } from "./layers/WatchStore"
import type { WatchStoreService } from "./layers/WatchStore"
import { searchHandler } from "./routes/search"
import { latestHandler } from "./routes/latest"
import { downloadHandler } from "./routes/download"
import { jobsHandler, clearJobsHandler } from "./routes/jobs"
import { getSettingsHandler, updateSettingsHandler, exportSettingsHandler, importSettingsHandler } from "./routes/settings"
import { convertUploadHandler, convertDownloadHandler } from "./routes/convert"
import {
  komgaLibrariesHandler,
  komgaSeriesHandler,
  komgaThumbnailHandler,
  komgaBooksHandler,
} from "./routes/komga"
import { copypartyFoldersHandler, createFolderHandler, deleteFolderHandler } from "./routes/copyparty"
import {
  listWatchesHandler,
  getWatchHandler,
  createWatchHandler,
  updateWatchHandler,
  deleteWatchHandler,
  listAlertsHandler,
  acknowledgeAlertHandler,
  acknowledgeAllAlertsHandler,
  unreadCountHandler,
} from "./routes/watches"
import { getVapidPublicKeyHandler, subscribeHandler, unsubscribeHandler } from "./routes/push"
import type { AppConfig, ProwlarrResult, CreateWatchRequest, UpdateWatchRequest, PushSubscriptionRequest } from "@inkpipe/shared"

type AllServices = LogService | ConfigService | JobStoreService | FileManagerService | ProwlarrService | AllDebridService | KomgaService | CopypartyService | KccService | PipelineService | WatchStoreService

// Layers with no service dependencies (constructable in isolation)
const NoDepLayer = Layer.mergeAll(
  LogServiceLive,
  ConfigServiceLive,
  JobStoreServiceLive,
  FileManagerServiceLive,
)

// Layers that depend on services from NoDepLayer during construction.
// Layer.provide builds the dependency first, then provides its context
// to the dependent layer — unlike Layer.mergeAll which builds concurrently.
const ProwlarrLayer = Layer.provide(ProwlarrServiceLive, NoDepLayer)
const AllDebridLayer = Layer.provide(AllDebridServiceLive, NoDepLayer)
const KomgaLayer = Layer.provide(KomgaServiceLive, NoDepLayer)
const CopypartyLayer = Layer.provide(CopypartyServiceLive, NoDepLayer)
const KccLayer = Layer.provide(KccServiceLive, NoDepLayer)

// Pipeline needs services from multiple layers during construction
const PipelineLayer = Layer.provide(
  PipelineServiceLive,
  Layer.mergeAll(NoDepLayer, AllDebridLayer, KccLayer, CopypartyLayer),
)

// Merge all self-contained layers. NoDepLayer is included so TypeScript
// infers the full service union for the ManagedRuntime type.
const WatchStoreLayer = Layer.provide(WatchStoreServiceLive, NoDepLayer)

const MainLayer = Layer.mergeAll(
  NoDepLayer,
  ProwlarrLayer,
  AllDebridLayer,
  KomgaLayer,
  CopypartyLayer,
  KccLayer,
  PipelineLayer,
  WatchStoreLayer,
) as Layer.Layer<AllServices, never, never>

const runtime = ManagedRuntime.make(MainLayer)

function getWebDistPath(): string {
  const pkgDir = import.meta.dir
  const candidates = [
    resolve(pkgDir, "../../web/dist"),
    resolve(pkgDir, "../../web/build/client"),
    resolve(pkgDir, "../../../dist/client"),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]
}

const WEB_DIST = getWebDistPath()

const isProduction = process.env.NODE_ENV === "production" || existsSync(WEB_DIST)

async function serveStatic(pathname: string): Promise<Response | null> {
  const filePath = `${WEB_DIST}${pathname}`
  const file = Bun.file(filePath)
  if (await file.exists()) {
    const ext = pathname.split(".").pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      html: "text/html", css: "text/css",
      js: "application/javascript", mjs: "application/javascript",
      json: "application/json", png: "image/png",
      jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
      svg: "image/svg+xml", ico: "image/x-icon", webp: "image/webp",
      woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
    }
    return new Response(file, {
      headers: { "Content-Type": mimeTypes[ext ?? ""] || "application/octet-stream" },
    })
  }
  return null
}

async function serveSpaFallback(): Promise<Response | null> {
  const candidates = [
    `${WEB_DIST}/index.html`,
    `${WEB_DIST}/../index.html`,
  ]
  for (const p of candidates) {
    const file = Bun.file(p)
    if (await file.exists()) return new Response(file, { headers: { "Content-Type": "text/html" } })
  }
  return null
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

function corsWrap(response: Response): Response {
  const h = new Headers(response.headers)
  for (const [k, v] of Object.entries(corsHeaders)) h.set(k, v)
  return new Response(response.body, { status: response.status, headers: h })
}

function api(resp: Response): Response {
  return corsWrap(resp)
}

const server = Bun.serve({
  port: Number(process.env.PORT || 3000),
  async fetch(req) {
    const url = new URL(req.url)
    const p = url.pathname
    const m = req.method

    if (m === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    try {
      // --- API routes ---
      if (p === "/api/search" && m === "GET") {
        const q = url.searchParams.get("q") || ""
        return api(await runtime.runPromise(searchHandler(q)))
      }
      if (p === "/api/latest" && m === "GET") {
        return api(await runtime.runPromise(latestHandler))
      }
      if (p === "/api/download" && m === "POST") {
        const body = (await req.json()) as { items: ProwlarrResult[]; subfolder?: string; newFolder?: boolean }
        return api(await runtime.runPromise(downloadHandler(body)))
      }
      if (p === "/api/jobs" && m === "GET") {
        return api(await runtime.runPromise(jobsHandler))
      }
      if (p === "/api/jobs" && m === "DELETE") {
        return api(await runtime.runPromise(clearJobsHandler))
      }
      if (p === "/api/settings" && m === "GET") {
        return api(await runtime.runPromise(getSettingsHandler))
      }
      if (p === "/api/settings" && m === "POST") {
        const body = (await req.json()) as AppConfig
        return api(await runtime.runPromise(updateSettingsHandler(body)))
      }
      if (p === "/api/settings/export" && m === "GET") {
        return api(await runtime.runPromise(exportSettingsHandler))
      }
      if (p === "/api/settings/import" && m === "POST") {
        const body = await req.json()
        return api(await runtime.runPromise(importSettingsHandler(body)))
      }
      if (p === "/api/convert" && m === "POST") {
        const fd = await req.formData() as FormData
        return api(await runtime.runPromise(convertUploadHandler(fd)))
      }
      if (p === "/api/convert" && m === "GET") {
        const id = url.searchParams.get("id") || ""
        if (!id) return api(Response.json({ error: "Missing id param" }, { status: 400 }))
        return api(await runtime.runPromise(convertDownloadHandler(id)))
      }
      if (p === "/api/komga/libraries" && m === "GET") {
        return api(await runtime.runPromise(komgaLibrariesHandler))
      }
      if (p === "/api/komga/series" && m === "POST") {
        const body = (await req.json()) as { libraryId?: string }
        return api(await runtime.runPromise(komgaSeriesHandler(body.libraryId)))
      }
      if (p === "/api/komga/thumbnail" && m === "GET") {
        const seriesId = url.searchParams.get("seriesId") || ""
        if (!seriesId) return api(Response.json({ error: "Missing seriesId param" }, { status: 400 }))
        return api(await runtime.runPromise(komgaThumbnailHandler(seriesId)))
      }
      if (p === "/api/komga/books" && m === "POST") {
        const body = (await req.json()) as { seriesId: string }
        return api(await runtime.runPromise(komgaBooksHandler(body.seriesId)))
      }
      if (p === "/api/copyparty/folders" && m === "GET") {
        return api(await runtime.runPromise(copypartyFoldersHandler))
      }
      if (p === "/api/copyparty/folders" && m === "POST") {
        const body = (await req.json()) as { name: string }
        return api(await runtime.runPromise(createFolderHandler(body)))
      }
      if (p === "/api/copyparty/folders" && m === "DELETE") {
        const body = (await req.json()) as { name: string }
        return api(await runtime.runPromise(deleteFolderHandler(body)))
      }

      // --- Watch routes ---
      if (p === "/api/watches" && m === "GET") {
        return api(await runtime.runPromise(listWatchesHandler))
      }
      if (p === "/api/watches/unread-count" && m === "GET") {
        return api(await runtime.runPromise(unreadCountHandler))
      }
      if (p === "/api/watches" && m === "POST") {
        const body = (await req.json()) as CreateWatchRequest
        return api(await runtime.runPromise(createWatchHandler(body)))
      }
      if (p === "/api/push/vapid-public-key" && m === "GET") {
        return api(await runtime.runPromise(getVapidPublicKeyHandler))
      }
      if (p === "/api/push/subscribe" && m === "POST") {
        const body = (await req.json()) as PushSubscriptionRequest
        return api(await runtime.runPromise(subscribeHandler(body)))
      }
      if (p === "/api/push/subscribe" && m === "DELETE") {
        const body = (await req.json()) as { endpoint: string }
        return api(await runtime.runPromise(unsubscribeHandler(body)))
      }

      // Watch routes with path params
      const watchMatch = p.match(/^\/api\/watches\/([^\/]+)\/alerts\/([^\/]+)\/acknowledge$/)
      if (watchMatch && m === "POST") {
        return api(await runtime.runPromise(acknowledgeAlertHandler(watchMatch[1], watchMatch[2])))
      }
      const ackAllMatch = p.match(/^\/api\/watches\/([^\/]+)\/alerts\/acknowledge-all$/)
      if (ackAllMatch && m === "POST") {
        return api(await runtime.runPromise(acknowledgeAllAlertsHandler(ackAllMatch[1])))
      }
      const alertsMatch = p.match(/^\/api\/watches\/([^\/]+)\/alerts$/)
      if (alertsMatch && m === "GET") {
        return api(await runtime.runPromise(listAlertsHandler(alertsMatch[1])))
      }
      const watchDetailMatch = p.match(/^\/api\/watches\/([^\/]+)$/)
      if (watchDetailMatch && m === "GET") {
        return api(await runtime.runPromise(getWatchHandler(watchDetailMatch[1])))
      }
      if (watchDetailMatch && m === "PUT") {
        const body = (await req.json()) as UpdateWatchRequest
        return api(await runtime.runPromise(updateWatchHandler(watchDetailMatch[1], body)))
      }
      if (watchDetailMatch && m === "DELETE") {
        return api(await runtime.runPromise(deleteWatchHandler(watchDetailMatch[1])))
      }

      // --- Static files + SPA fallback (production only) ---
      if (isProduction) {
        const staticResp = await serveStatic(p)
        if (staticResp) return staticResp
        const spaResp = await serveSpaFallback()
        if (spaResp) return spaResp
      }

      return api(Response.json({ error: "Not found" }, { status: 404 }))
    } catch (e) {
      console.error("[server] Unexpected error:", e)
      return api(Response.json(
        { error: e instanceof Error ? e.message : "Internal server error" },
        { status: 500 },
      ))
    }
  },
})

console.log(`[inkpipe] Server running on http://localhost:${server.port}`)
