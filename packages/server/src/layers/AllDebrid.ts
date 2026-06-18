import { Effect, Layer } from "effect"
import {
  type DebridFile,
  type UploadResult,
  AllDebridNotConfigured,
  AllDebridHttpError,
  MagnetUploadError,
  MagnetStatusError,
} from "@inkpipe/shared"
import { ConfigService } from "./Config"

export class AllDebridService extends Effect.Tag("AllDebridService")<
  AllDebridService,
  {
    readonly uploadMagnet: (magnetOrUrl: string) => Effect.Effect<UploadResult, AllDebridNotConfigured | MagnetUploadError | AllDebridHttpError>
    readonly getMagnetStatus: (magnetId: number) => Effect.Effect<{ ready: boolean; statusCode: number; status: string }, AllDebridNotConfigured | MagnetStatusError | AllDebridHttpError>
    readonly getMagnetFiles: (magnetId: number) => Effect.Effect<DebridFile[], AllDebridNotConfigured | AllDebridHttpError>
    readonly unlockLink: (link: string) => Effect.Effect<{ url: string; filename: string; size: number }, AllDebridNotConfigured | AllDebridHttpError>
    readonly deleteMagnet: (magnetId: number) => Effect.Effect<void, AllDebridNotConfigured>
    readonly downloadFile: (url: string, destPath: string, onProgress?: (received: number, total: number) => void) => Effect.Effect<void, AllDebridNotConfigured | AllDebridHttpError>
  }
>() {}

const AGENT = "inkpipe"
const BASE_URL = "https://api.alldebrid.com"

function buildUrl(path: string, extraParams?: Record<string, string>): string {
  const url = new URL(path, BASE_URL)
  url.searchParams.set("agent", AGENT)
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      url.searchParams.set(k, v)
    }
  }
  return url.toString()
}

function fetchWithAuth(url: string, apiKey: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      "Authorization": `Bearer ${apiKey}`,
    },
  })
}

interface ApiResponse<T> {
  status: string
  data?: T
  error?: { code: string; message: string }
}

function parseApiResponse<T>(raw: ApiResponse<T>): T {
  if (raw.status === "error") {
    throw new Error(`API error: ${raw.error?.code ?? "UNKNOWN"} - ${raw.error?.message ?? "Unknown error"}`)
  }
  if (!raw.data) {
    throw new Error("No data in API response")
  }
  return raw.data
}

async function pollDelayedLink(delayedId: number, apiKey: string, maxAttempts = 30): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`[alldebrid] Polling delayed link ${delayedId} (attempt ${attempt + 1}/${maxAttempts})`)
    const body = new URLSearchParams({ id: String(delayedId) })
    const response = await fetchWithAuth(buildUrl("v4/link/delayed"), apiKey, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(30000),
    })
    const raw = await response.json() as ApiResponse<{ status: number; time_left: number; link?: string }>
    const data = parseApiResponse(raw)

    if (data.status === 2 && data.link) {
      return data.link
    }

    if (data.status >= 3) {
      throw new Error(`Delayed link generation failed (status ${data.status})`)
    }

    const wait = Math.min((data.time_left ?? 5) * 1000 + 1000, 30000)
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
  throw new Error(`Delayed link ${delayedId} did not become available within ${maxAttempts} attempts`)
}

async function downloadWithRetry(
  url: string,
  destPath: string,
  onProgress?: (received: number, total: number) => void,
  maxRetries = 3,
): Promise<void> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await downloadSingle(url, destPath, onProgress)
      return
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
        console.log(`[alldebrid] Download attempt ${attempt + 1} failed: ${lastError.message}, retrying in ${delay}ms`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError ?? new Error("Download failed: unknown error")
}

async function downloadSingle(
  url: string,
  destPath: string,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  console.log(`[alldebrid] Downloading to: ${destPath}`)
  console.log(`[alldebrid] From URL: ${url.slice(0, 120)}...`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`)
  }
  const total = Number(response.headers.get("content-length") ?? 0)
  console.log(`[alldebrid] Download started, content-length: ${total}`)
  const chunks: Uint8Array[] = []
  const reader = response.body!.getReader()
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    onProgress?.(received, total)
    chunks.push(value)
  }
  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  await Bun.write(destPath, buffer)
  console.log(`[alldebrid] Download complete: ${destPath} (${received} bytes)`)
}

export const AllDebridServiceLive = Layer.effect(
  AllDebridService,
  Effect.gen(function* () {
    const configService = yield* ConfigService

    const uploadMagnet = (magnetOrUrl: string) =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.catchAll((e) => Effect.fail(new AllDebridNotConfigured({ message: e.message }))),
        )
        const apiKey = config.alldebrid.apiKey
        if (!apiKey) {
          return yield* Effect.fail(
            new AllDebridNotConfigured({ message: "AllDebrid API key not configured" }),
          )
        }

        if (isMagnetUri(magnetOrUrl)) {
          return yield* Effect.tryPromise({
            try: () => uploadViaMagnet(magnetOrUrl, apiKey),
            catch: (e) => {
              const message = e instanceof Error ? e.message : String(e)
              return new MagnetUploadError({ message: `Upload failed: ${message}` })
            },
          })
        }
        return yield* Effect.tryPromise({
          try: () => uploadViaTorrentUrl(magnetOrUrl, apiKey),
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e)
            return new MagnetUploadError({ message: `Upload failed: ${message}` })
          },
        })
      })

    const getMagnetStatus = (magnetId: number) =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.catchAll((e) => Effect.fail(new AllDebridNotConfigured({ message: e.message }))),
        )
        const apiKey = config.alldebrid.apiKey
        if (!apiKey) {
          return yield* Effect.fail(
            new AllDebridNotConfigured({ message: "AllDebrid API key not configured" }),
          )
        }

        return yield* Effect.tryPromise({
          try: async () => {
            console.log(`[alldebrid] Checking status for magnet ${magnetId}`)
            const body = new URLSearchParams({ id: String(magnetId) })
            const response = await fetchWithAuth(buildUrl("v4.1/magnet/status"), apiKey, {
              method: "POST",
              body,
              signal: AbortSignal.timeout(30000),
            })
            const data = parseApiResponse<{
              magnets?: Array<{ id: number; filename: string; statusCode: number; status: string }>
            }>(await response.json() as ApiResponse<{ magnets?: Array<{ id: number; filename: string; statusCode: number; status: string }> }>)
            console.log(`[alldebrid] Status response for magnet ${magnetId}:`, JSON.stringify(data))
            const magnets = data.magnets
            const magnet = Array.isArray(magnets) ? magnets[0] : magnets
            if (!magnet) {
              console.log(`[alldebrid] Magnet ${magnetId} not yet in response`)
              return { ready: false, statusCode: 0, status: "Waiting" }
            }
            return { ready: magnet.statusCode === 4, statusCode: magnet.statusCode, status: magnet.status }
          },
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e)
            return new MagnetStatusError({ message: `Status check failed: ${message}` })
          },
        })
      })

    const getMagnetFiles = (magnetId: number) =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.catchAll((e) => Effect.fail(new AllDebridNotConfigured({ message: e.message }))),
        )
        const apiKey = config.alldebrid.apiKey
        if (!apiKey) {
          return yield* Effect.fail(
            new AllDebridNotConfigured({ message: "AllDebrid API key not configured" }),
          )
        }

        return yield* Effect.tryPromise({
          try: async () => {
            console.log(`[alldebrid] Fetching files for magnet ${magnetId}`)
            const body = new URLSearchParams()
            body.append("id[]", String(magnetId))
            const response = await fetchWithAuth(buildUrl("v4/magnet/files"), apiKey, {
              method: "POST",
              body,
              signal: AbortSignal.timeout(30000),
            })
            const data = parseApiResponse<{
              magnets?: Array<{ files: FileNode[] }>
            }>(await response.json() as ApiResponse<{ magnets?: Array<{ files: FileNode[] }> }>)
            const magnetData = data.magnets?.[0]
            if (!magnetData?.files) {
              throw new Error("No files returned from AllDebrid")
            }
            const files = flattenFileTree(magnetData.files)
            console.log(`[alldebrid] Found ${files.length} files for magnet ${magnetId}`)
            return files
          },
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e)
            return new AllDebridHttpError({ message: `Files fetch failed: ${message}` })
          },
        })
      })

    const unlockLink = (link: string) =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.catchAll((e) => Effect.fail(new AllDebridNotConfigured({ message: e.message }))),
        )
        const apiKey = config.alldebrid.apiKey
        if (!apiKey) {
          return yield* Effect.fail(
            new AllDebridNotConfigured({ message: "AllDebrid API key not configured" }),
          )
        }

        return yield* Effect.tryPromise({
          try: async () => {
            console.log(`[alldebrid] Unlocking link: ${link}`)
            const body = new URLSearchParams({ link })
            const response = await fetchWithAuth(buildUrl("v4/link/unlock"), apiKey, {
              method: "POST",
              body,
              signal: AbortSignal.timeout(30000),
            })
            const raw = await response.json() as ApiResponse<{
              link: string
              filename: string
              filesize: number
              delayed?: number
            }>
            const data = parseApiResponse(raw)

            if (data.delayed) {
              const downloadUrl = await pollDelayedLink(data.delayed, apiKey)
              return { url: downloadUrl, filename: data.filename, size: data.filesize }
            }

            return { url: data.link, filename: data.filename, size: data.filesize }
          },
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e)
            return new AllDebridHttpError({ message: `Unlock failed: ${message}` })
          },
        })
      })

    const deleteMagnet = (magnetId: number) =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.catchAll((e) => Effect.fail(new AllDebridNotConfigured({ message: e.message }))),
        )
        const apiKey = config.alldebrid.apiKey
        if (!apiKey) {
          return yield* Effect.fail(
            new AllDebridNotConfigured({ message: "AllDebrid API key not configured" }),
          )
        }

        yield* Effect.tryPromise({
          try: async () => {
            console.log(`[alldebrid] Deleting magnet ${magnetId}`)
            await fetchWithAuth(buildUrl("v4/magnet/delete", { id: String(magnetId) }), apiKey)
          },
          catch: (e) => {
            console.error(`[alldebrid] Failed to delete magnet ${magnetId}:`, e)
            return new AllDebridNotConfigured({ message: `Delete failed: ${e instanceof Error ? e.message : String(e)}` })
          },
        })
      })

    const downloadFile = (
      url: string,
      destPath: string,
      onProgress?: (received: number, total: number) => void,
    ) =>
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () => downloadWithRetry(url, destPath, onProgress),
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e)
            return new AllDebridHttpError({ message: `Download failed: ${message}` })
          },
        })
      })

    return { uploadMagnet, getMagnetStatus, getMagnetFiles, unlockLink, deleteMagnet, downloadFile }
  }),
)

function isMagnetUri(url: string): boolean {
  return url.startsWith("magnet:")
}

interface FileNode {
  n: string
  s?: number
  l?: string
  e?: FileNode[]
}

function flattenFileTree(nodes: FileNode[]): DebridFile[] {
  const files: DebridFile[] = []
  for (const node of nodes) {
    if (node.l) {
      files.push({ filename: node.n, link: node.l, size: node.s ?? 0 })
    }
    if (node.e) {
      files.push(...flattenFileTree(node.e))
    }
  }
  return files
}

async function uploadViaMagnet(magnetUri: string, apiKey: string): Promise<UploadResult> {
  console.log("[alldebrid] Uploading magnet URI:", magnetUri.slice(0, 80) + "...")
  const response = await fetchWithAuth(
    buildUrl("v4/magnet/upload", { magnets: magnetUri }),
    apiKey,
  )
  const data = parseApiResponse<{
    magnets?: Array<{ id: number; ready: boolean; error?: { code: string; message: string } }>
  }>(await response.json() as ApiResponse<{ magnets?: Array<{ id: number; ready: boolean; error?: { code: string; message: string } }> }>)
  console.log("[alldebrid] Magnet upload response:", JSON.stringify(data))
  const magnet = data.magnets?.[0]
  if (!magnet) throw new Error("No magnet returned from AllDebrid")
  if (magnet.error) throw new Error(`AllDebrid magnet error: ${magnet.error.code} - ${magnet.error.message}`)
  return { id: magnet.id, ready: magnet.ready }
}

async function uploadViaTorrentUrl(torrentUrl: string, apiKey: string): Promise<UploadResult> {
  console.log("[alldebrid] Downloading .torrent from:", torrentUrl.slice(0, 120))

  const torrentResponse = await fetch(torrentUrl, { signal: AbortSignal.timeout(60000) })
  const torrentBuffer = await torrentResponse.arrayBuffer()
  console.log("[alldebrid] Downloaded .torrent, size:", torrentBuffer.byteLength)

  const formData = new FormData()
  const blob = new Blob([torrentBuffer], { type: "application/x-bittorrent" })
  formData.append("files[]", blob, "file.torrent")

  const response = await fetchWithAuth(buildUrl("v4/magnet/upload/file"), apiKey, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(30000),
  })
  const data = parseApiResponse<{
    files?: Array<{ id: number; ready: boolean; error?: { code: string; message: string } }>
  }>(await response.json() as ApiResponse<{ files?: Array<{ id: number; ready: boolean; error?: { code: string; message: string } }> }>)
  console.log("[alldebrid] Torrent upload response:", JSON.stringify(data))
  const file = data.files?.[0]
  if (!file) throw new Error("No file returned from AllDebrid")
  if (file.error) throw new Error(`AllDebrid torrent error: ${file.error.code} - ${file.error.message}`)
  return { id: file.id, ready: file.ready }
}
