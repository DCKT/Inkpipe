import { spawn } from 'node:child_process'
import { basename } from 'node:path'
import type { AppConfig } from '../config'

export function convertWithKcc(
  inputPath: string,
  outputDir: string,
  config: AppConfig,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const inputFilename = basename(inputPath)

    // Mount the output dir (which contains the input file) into the container
    const args = [
      'run',
      '--rm',
      '-v', `${outputDir}:/data`,
      config.kcc.dockerImage,
      '--profile', config.kcc.profile,
      `/data/${inputFilename}`,
      '-o', '/data',
    ]

    const proc = spawn('docker', args)

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(`KCC Docker exited with code ${code}: ${stderr}`))
      }
    })

    proc.on('error', (err) => {
      reject(new Error(`Failed to start Docker for KCC: ${err.message}`))
    })
  })
}
