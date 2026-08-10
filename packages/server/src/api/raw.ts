// Routes that sit outside the typed HttpApi: the /api/jobs/ws WebSocket
// broadcaster and the production-only static file / SPA fallback route.
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import type { Socket } from "effect/unstable/socket"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { JobStoreService } from "../layers/storage/JobStore"
import { subscribeJobEvents, subscribeJobListEvents } from "../lib/jobEvents"
import type { Job } from "@inkpipe/shared"

// --- WebSocket broadcaster for /api/jobs/ws ---
//
// Mirrors the pre-migration `jobSockets` Set + `broadcastToJobSockets`
// behavior in main.ts: a single global subscription to jobEvents.ts feeds
// every currently-connected socket writer.

type Writer = (chunk: string) => Effect.Effect<void, Socket.SocketError>

const jobSocketWriters = new Set<Writer>()

function broadcastToJobSockets(payload: unknown): void {
  const message = JSON.stringify(payload)
  for (const write of jobSocketWriters) {
    Effect.runFork(write(message).pipe(Effect.ignore))
  }
}

subscribeJobEvents((job: Job) => broadcastToJobSockets({ type: "update", job }))
subscribeJobListEvents((jobs: Job[]) => broadcastToJobSockets({ type: "init", jobs }))

const jobsWsHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const jobStore = yield* JobStoreService
  const socket = yield* request.upgrade
  const write = yield* socket.writer

  jobSocketWriters.add(write)
  yield* Effect.addFinalizer(() => Effect.sync(() => jobSocketWriters.delete(write)))

  const sendInitialJobs = Effect.gen(function* () {
    const jobs = yield* jobStore.getAllJobs
    yield* write(JSON.stringify({ type: "init", jobs }))
  }).pipe(Effect.ignore)

  yield* socket.run(() => Effect.void, { onOpen: sendInitialJobs }).pipe(
    Effect.ignore,
  )

  return HttpServerResponse.empty()
}).pipe(Effect.scoped)

export const JobsWsRouteLive = HttpRouter.add("GET", "/api/jobs/ws", jobsWsHandler)

// --- Static files + SPA fallback (production only), lowest priority ---

function getWebDistPath(): string {
  const pkgDir = import.meta.dir
  const candidates = [
    resolve(pkgDir, "../../../web/dist"),
    resolve(pkgDir, "../../../web/build/client"),
    resolve(pkgDir, "../../../../dist/client"),
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

const staticFallbackHandler = (request: HttpServerRequest.HttpServerRequest) =>
  Effect.promise(async () => {
    if (!isProduction) return null
    const pathname = new URL(request.url, "http://localhost").pathname
    return (await serveStatic(pathname)) ?? (await serveSpaFallback())
  }).pipe(
    Effect.map((response) =>
      response ? HttpServerResponse.fromWeb(response) : HttpServerResponse.jsonUnsafe({ error: "Not found" }, { status: 404 }),
    ),
  )

export const StaticFallbackRouteLive = HttpRouter.add("GET", "*", staticFallbackHandler)
