import { mkdir, rm, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { spawn } from 'node:child_process'

const DOCKER_TEMP_DIR = '/tmp/inkpipe'

export function isRunningInDocker(): boolean {
  return existsSync('/.dockerenv')
}

export function getTempBase(): string {
  return isRunningInDocker() ? DOCKER_TEMP_DIR : join(tmpdir(), 'inkpipe')
}

export function getJobDir(jobId: string): string {
  return join(getTempBase(), jobId)
}

export async function ensureJobDir(jobId: string): Promise<string> {
  const dir = getJobDir(jobId)
  await mkdir(dir, { recursive: true })
  return dir
}

export async function cleanupJobDir(jobId: string): Promise<void> {
  const dir = getJobDir(jobId)
  await rm(dir, { recursive: true, force: true })
}

export async function findFileByExtension(dir: string, extensions: string[]): Promise<string | null> {
  const files = await readdir(dir)
  const match = files.find((f) =>
    extensions.some((ext) => f.toLowerCase().endsWith(ext)),
  )
  return match ? join(dir, match) : null
}

export async function findAllFilesByExtension(dir: string, extensions: string[]): Promise<string[]> {
  const files = await readdir(dir)
  return files
    .filter((f) => extensions.some((ext) => f.toLowerCase().endsWith(ext)))
    .map((f) => join(dir, f))
}

export async function extractRarArchive(filePath: string): Promise<string> {
  const { name, dir } = parse(filePath)
  const extractDir = join(dir, name)
  await mkdir(extractDir, { recursive: true })

  return new Promise((resolve, reject) => {
    const proc = spawn('unrar', ['x', '-o+', filePath, extractDir])

    let stderr = ''
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(extractDir)
      } else {
        reject(new Error(`unrar exited with code ${code}: ${stderr}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start unrar: ${err.message}`))
    })
  })
}
