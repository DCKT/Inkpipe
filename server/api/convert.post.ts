import { defineEventHandler, readMultipartFormData, createError } from 'h3'
import { writeFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { convertWithKcc } from '../../src/lib/services/kcc'
import { loadConfig } from '../../src/lib/config'
import { getTempBase } from '../../src/lib/services/fileManager'

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)

  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file provided' })
  }

  const file = formData[0]
  if (!file.filename) {
    throw createError({ statusCode: 400, statusMessage: 'No filename' })
  }

  const ext = file.filename.toLowerCase().split('.').pop()
  if (ext !== 'cbz') {
    throw createError({ statusCode: 400, statusMessage: 'Only .cbz files are accepted' })
  }

  const id = randomUUID()
  const workDir = join(getTempBase(), `convert-${id}`)
  await mkdir(workDir, { recursive: true })

  const inputPath = join(workDir, file.filename)
  await writeFile(inputPath, file.data)

  const config = await loadConfig()
  await convertWithKcc(inputPath, workDir, config)

  const files = await readdir(workDir)
  const epubFile = files.find((f) => f.toLowerCase().endsWith('.epub'))
  if (!epubFile) {
    throw createError({ statusCode: 500, statusMessage: 'KCC did not produce an EPUB file' })
  }

  return { id, filename: epubFile }
})
