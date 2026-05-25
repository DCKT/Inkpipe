import { createServerFn } from '@tanstack/react-start'
import { writeFile, readdir, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { convertWithKcc } from '../../lib/services/kcc'
import { loadConfig } from '../../lib/config'
import { getTempBase } from '../../lib/services/fileManager'

export const convertFileFn = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error('Expected FormData')
    }

    const file = data.get('file')
    if (!file || !(file instanceof Blob)) {
      throw new Error('No file provided')
    }

    const filename = file.name || 'unknown'
    const ext = filename.toLowerCase().split('.').pop()
    if (ext !== 'cbz') {
      throw new Error('Only .cbz files are accepted')
    }

    return { file, filename }
  })
  .handler(async ({ data }) => {
    const { file, filename } = data

    const id = randomUUID()
    const workDir = join(getTempBase(), `convert-${id}`)
    await mkdir(workDir, { recursive: true })

    const inputPath = join(workDir, filename)
    const arrayBuffer = await file.arrayBuffer()
    await writeFile(inputPath, Buffer.from(arrayBuffer))

    const config = await loadConfig()
    await convertWithKcc(inputPath, workDir, config)

    const files = await readdir(workDir)
    const epubFile = files.find((f) => f.toLowerCase().endsWith('.epub'))
    if (!epubFile) {
      throw new Error('KCC did not produce an EPUB file')
    }

    return { id, filename: epubFile }
  })

export const downloadConvertedFileFn = createServerFn({ method: 'GET' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { id } = data

    const workDir = join(getTempBase(), `convert-${id}`)

    let epubFile: string | undefined
    try {
      const files = await readdir(workDir)
      epubFile = files.find((f) => f.toLowerCase().endsWith('.epub'))
    } catch {
      throw new Error('Conversion not found')
    }

    if (!epubFile) {
      await rm(workDir, { recursive: true, force: true })
      throw new Error('EPUB not found')
    }

    const filePath = join(workDir, epubFile)
    const fileBuffer = await readFile(filePath)

    await rm(workDir, { recursive: true, force: true })

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(epubFile)}"`,
        'Content-Length': String(fileBuffer.byteLength),
      },
    })
  })