import { mkdir, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AppConfig } from '../config'

export function getTempBase(config: AppConfig): string {
  return config.tempDir || join(tmpdir(), 'inkpipe')
}

export function getJobDir(jobId: string, config: AppConfig): string {
  return join(getTempBase(config), jobId)
}

export async function ensureJobDir(jobId: string, config: AppConfig): Promise<string> {
  const dir = getJobDir(jobId, config)
  await mkdir(dir, { recursive: true })
  return dir
}

export async function cleanupJobDir(jobId: string, config: AppConfig): Promise<void> {
  const dir = getJobDir(jobId, config)
  await rm(dir, { recursive: true, force: true })
}

export async function findFileByExtension(dir: string, extensions: string[]): Promise<string | null> {
  const files = await readdir(dir)
  const match = files.find((f) =>
    extensions.some((ext) => f.toLowerCase().endsWith(ext)),
  )
  return match ? join(dir, match) : null
}
