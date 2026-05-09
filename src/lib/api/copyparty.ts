import ky from 'ky'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { AppConfig } from '../config'

export async function listCopypartyFolders(config: AppConfig): Promise<string[]> {
  const { url, uploadPath, password } = config.copyparty
  if (!url) return []

  const base = url.replace(/\/+$/, '')
  const path = uploadPath.replace(/^\/+|\/+$/g, '')
  const listUrl = path ? `${base}/${path}/` : `${base}/`

  const searchParams: Record<string, string> = { ls: '' }
  if (password) searchParams.pw = password

  try {
    const data = await ky.get(listUrl, { searchParams, timeout: 10000 }).json<unknown>()
    // Copyparty ?ls returns an object with a "dirs" array of directory entries
    // Each entry is an array where index 0 is the name
    if (data && typeof data === 'object' && 'dirs' in data) {
      const dirs = (data as { dirs: unknown[] }).dirs
      if (Array.isArray(dirs)) {
        return dirs
          .map((d) => (Array.isArray(d) ? String(d[0]) : null))
          .filter((name): name is string => name !== null && name !== '' && !name.startsWith('.'))
      }
    }
    return []
  } catch {
    return []
  }
}

export async function uploadToCopyparty(
  filePath: string,
  config: AppConfig,
  subfolder?: string,
): Promise<void> {
  const { url, uploadPath, password } = config.copyparty
  if (!url) {
    throw new Error('Copyparty is not configured')
  }

  const filename = basename(filePath)
  const fileBuffer = await readFile(filePath)

  // Build upload URL: {base}/{uploadPath}/{subfolder?}/{filename}
  const base = url.replace(/\/+$/, '')
  const path = uploadPath.replace(/^\/+|\/+$/g, '')
  const sub = subfolder ? subfolder.replace(/^\/+|\/+$/g, '') : ''
  const segments = [path, sub].filter(Boolean).join('/')
  const uploadUrl = `${base}/${segments}/${encodeURIComponent(filename)}`

  const searchParams: Record<string, string> = {}
  if (password) {
    searchParams.pw = password
  }

  console.log(`[copyparty] Uploading ${filename} (${fileBuffer.byteLength} bytes) to ${uploadUrl}`)

  const response = await ky.put(uploadUrl, {
    body: fileBuffer,
    searchParams,
    timeout: 300000,
  })

  console.log('[copyparty] Upload response status:', response.status)
  const text = await response.text()
  console.log('[copyparty] Upload response:', text)
}
