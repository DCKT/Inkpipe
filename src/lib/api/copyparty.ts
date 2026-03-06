import ky from 'ky'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { AppConfig } from '../config'

export async function uploadToCopyparty(
  filePath: string,
  config: AppConfig,
): Promise<void> {
  const { url, uploadPath, password } = config.copyparty
  if (!url) {
    throw new Error('Copyparty is not configured')
  }

  const filename = basename(filePath)
  const fileBuffer = await readFile(filePath)

  // Build upload URL: {base}/{uploadPath}/{filename}
  const base = url.replace(/\/+$/, '')
  const path = uploadPath.replace(/^\/+|\/+$/g, '')
  const uploadUrl = `${base}/${path}/${encodeURIComponent(filename)}`

  const searchParams: Record<string, string> = {}
  if (password) {
    searchParams.pw = password
  }

  console.log('[copyparty] Uploading %s (%d bytes) to %s', filename, fileBuffer.byteLength, uploadUrl)

  const response = await ky.put(uploadUrl, {
    body: fileBuffer,
    searchParams,
    timeout: 300000,
  })

  console.log('[copyparty] Upload response status:', response.status)
  const text = await response.text()
  console.log('[copyparty] Upload response:', text)
}
