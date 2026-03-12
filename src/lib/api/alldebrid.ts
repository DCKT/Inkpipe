import ky from 'ky'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { AppConfig } from '../config'

const AGENT = 'inkpipe'

function client(config: AppConfig) {
  return ky.create({
    prefixUrl: 'https://api.alldebrid.com',
    searchParams: { agent: AGENT, apikey: config.alldebrid.apiKey },
    timeout: 30000,
  })
}

interface MagnetUploadResponse {
  status: string
  data: {
    magnets: Array<{ id: number; ready: boolean; error?: { code: string; message: string } }>
  }
}

interface TorrentUploadResponse {
  status: string
  data: {
    files: Array<{ id: number; ready: boolean; error?: { code: string; message: string } }>
  }
}

function isMagnetUri(url: string): boolean {
  return url.startsWith('magnet:')
}

export interface UploadResult {
  id: number
  ready: boolean
}

async function uploadViaMagnet(
  magnetUri: string,
  config: AppConfig,
): Promise<UploadResult> {
  const api = client(config)
  console.log('[alldebrid] Uploading magnet URI:', magnetUri.slice(0, 80) + '...')

  const raw = await api
    .get('v4/magnet/upload', {
      searchParams: { magnets: magnetUri },
    })
    .json()
  console.log('[alldebrid] Magnet upload response:', JSON.stringify(raw, null, 2))
  const res = raw as MagnetUploadResponse

  const magnet = res.data?.magnets?.[0]
  if (!magnet) {
    throw new Error('No magnet returned from AllDebrid')
  }
  if (magnet.error) {
    throw new Error(`AllDebrid magnet error: ${magnet.error.code} - ${magnet.error.message}`)
  }
  console.log('[alldebrid] Magnet uploaded, id:', magnet.id, 'ready:', magnet.ready)
  return { id: magnet.id, ready: magnet.ready }
}

async function uploadViaTorrentUrl(
  torrentUrl: string,
  config: AppConfig,
): Promise<UploadResult> {
  console.log('[alldebrid] Downloading .torrent file from:', torrentUrl.slice(0, 120))

  // Download the .torrent file from Prowlarr
  const torrentResponse = await ky.get(torrentUrl, { timeout: 30000 })
  const torrentBuffer = await torrentResponse.arrayBuffer()
  console.log('[alldebrid] Downloaded .torrent file, size:', torrentBuffer.byteLength, 'bytes')

  // Upload .torrent file to AllDebrid via multipart
  const formData = new FormData()
  const blob = new Blob([torrentBuffer], { type: 'application/x-bittorrent' })
  formData.append('files[]', blob, 'file.torrent')

  const api = client(config)
  const raw = await api
    .post('v4/magnet/upload/file', {
      body: formData,
    })
    .json()
  console.log('[alldebrid] Torrent upload response:', JSON.stringify(raw, null, 2))
  const res = raw as TorrentUploadResponse

  const file = res.data?.files?.[0]
  if (!file) {
    throw new Error('No file returned from AllDebrid torrent upload')
  }
  if (file.error) {
    throw new Error(`AllDebrid torrent error: ${file.error.code} - ${file.error.message}`)
  }
  console.log('[alldebrid] Torrent uploaded, id:', file.id, 'ready:', file.ready)
  return { id: file.id, ready: file.ready }
}

export async function uploadMagnet(
  magnetOrUrl: string,
  config: AppConfig,
): Promise<UploadResult> {
  try {
    if (isMagnetUri(magnetOrUrl)) {
      return await uploadViaMagnet(magnetOrUrl, config)
    } else {
      console.log('[alldebrid] URL is not a magnet URI, treating as .torrent download URL')
      return await uploadViaTorrentUrl(magnetOrUrl, config)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[alldebrid] Upload failed:', message)
    if (err && typeof err === 'object' && 'response' in err) {
      try {
        const body = await (err as { response: Response }).response.text()
        console.error('[alldebrid] Response body:', body)
      } catch { /* ignore */ }
    }
    throw err
  }
}

// v4.1 magnet/status response
interface MagnetStatusResponse {
  status: string
  data: {
    magnets: Array<{
      id: number
      filename: string
      size: number
      statusCode: number
      status: string
    }>
  }
}

export async function getMagnetStatus(
  magnetId: number,
  config: AppConfig,
): Promise<{ ready: boolean; statusCode: number; status: string }> {
  const api = client(config)

  try {
    const body = new URLSearchParams()
    body.set('id', String(magnetId))
    const raw = await api
      .post('v4.1/magnet/status', {
        body,
      })
      .json()
    console.log(`[alldebrid] Status raw response for magnet ${magnetId}:`, JSON.stringify(raw, null, 2))
    const res = raw as MagnetStatusResponse

    const magnets = res.data?.magnets
    const magnet = Array.isArray(magnets) ? magnets[0] : magnets
    if (!magnet) {
      console.log(`[alldebrid] Magnet ${magnetId} not yet in status response, treating as not ready`)
      return { ready: false, statusCode: 0, status: 'Waiting' }
    }

    const ready = magnet.statusCode === 4
    console.log(
      '[alldebrid] Magnet', magnetId,
      'status:', magnet.status,
      'statusCode:', magnet.statusCode,
      'ready:', ready,
    )
    return { ready, statusCode: magnet.statusCode, status: magnet.status }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[alldebrid] Status check failed for magnet', magnetId, ':', message)
    if (err && typeof err === 'object' && 'response' in err) {
      try {
        const body = await (err as { response: Response }).response.text()
        console.error('[alldebrid] Response body:', body)
      } catch { /* ignore */ }
    }
    throw err
  }
}

// v4/magnet/files response — nested file tree
interface MagnetFileNode {
  n: string  // filename or folder name
  s?: number // size in bytes (files only)
  l?: string // download link (files only)
  e?: MagnetFileNode[] // sub-elements (folders only)
}

interface MagnetFilesResponse {
  status: string
  data: {
    magnets: Array<{
      id: number
      files: MagnetFileNode[]
    }>
  }
}

export interface DebridFile {
  filename: string
  link: string
  size: number
}

function flattenFileTree(nodes: MagnetFileNode[]): DebridFile[] {
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

export async function getMagnetFiles(
  magnetId: number,
  config: AppConfig,
): Promise<DebridFile[]> {
  const api = client(config)
  console.log('[alldebrid] Fetching files for magnet:', magnetId)

  try {
    const body = new URLSearchParams()
    body.append('id[]', String(magnetId))
    const raw = await api
      .post('v4/magnet/files', {
        body,
      })
      .json()
    console.log(`[alldebrid] Files raw response for magnet ${magnetId}:`, JSON.stringify(raw, null, 2))
    const res = raw as MagnetFilesResponse

    const magnet = res.data?.magnets?.[0]
    if (!magnet?.files) {
      console.error('[alldebrid] No files found in response')
      throw new Error('No files returned from AllDebrid')
    }

    const files = flattenFileTree(magnet.files)
    console.log(`[alldebrid] Found ${files.length} files for magnet ${magnetId}:`, files.map(f => f.filename))
    return files
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[alldebrid] Files fetch failed for magnet', magnetId, ':', message)
    if (err && typeof err === 'object' && 'response' in err) {
      try {
        const body = await (err as { response: Response }).response.text()
        console.error('[alldebrid] Response body:', body)
      } catch { /* ignore */ }
    }
    throw err
  }
}

interface UnlockResponse {
  status: string
  data: {
    link: string
    filename: string
    size: number
  }
}

export async function unlockLink(
  link: string,
  config: AppConfig,
): Promise<{ url: string; filename: string; size: number }> {
  const api = client(config)
  console.log('[alldebrid] Unlocking link:', link)

  try {
    const raw = await api
      .get('v4/link/unlock', {
        searchParams: { link },
      })
      .json()
    console.log('[alldebrid] Unlock response:', JSON.stringify(raw, null, 2))
    const res = raw as UnlockResponse
    return {
      url: res.data.link,
      filename: res.data.filename,
      size: res.data.size,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[alldebrid] Unlock failed:', message)
    if (err && typeof err === 'object' && 'response' in err) {
      try {
        const body = await (err as { response: Response }).response.text()
        console.error('[alldebrid] Response body:', body)
      } catch { /* ignore */ }
    }
    throw err
  }
}

export async function deleteMagnet(
  magnetId: number,
  config: AppConfig,
): Promise<void> {
  const api = client(config)
  console.log('[alldebrid] Deleting magnet:', magnetId)

  try {
    await api.get('v4/magnet/delete', {
      searchParams: { id: String(magnetId) },
    })
    console.log('[alldebrid] Magnet deleted:', magnetId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[alldebrid] Failed to delete magnet', magnetId, ':', message)
  }
}

export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  console.log('[alldebrid] Downloading file to:', destPath)
  console.log('[alldebrid] From URL:', url.slice(0, 120) + '...')

  const response = await ky.get(url, { timeout: false })
  const total = Number(response.headers.get('content-length') ?? 0)
  console.log('[alldebrid] Download started, content-length:', total)
  let received = 0

  const body = response.body
  if (!body) throw new Error('No response body')

  const reader = body.getReader()
  const nodeStream = new Readable({
    async read() {
      const { done, value } = await reader.read()
      if (done) {
        this.push(null)
        return
      }
      received += value.byteLength
      onProgress?.(received, total)
      this.push(Buffer.from(value))
    },
  })

  await pipeline(nodeStream, createWriteStream(destPath))
  console.log('[alldebrid] Download complete:', destPath, `(${received} bytes)`)
}
