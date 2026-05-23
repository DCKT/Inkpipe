import { defineEventHandler, getQuery, createError } from 'h3'
import { readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { getTempBase } from '../../src/lib/services/fileManager'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const id = query.id as string

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing id parameter' })
  }

  const workDir = join(getTempBase(), `convert-${id}`)

  let epubFile: string | undefined
  try {
    const files = await readdir(workDir)
    epubFile = files.find((f) => f.toLowerCase().endsWith('.epub'))
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Conversion not found' })
  }

  if (!epubFile) {
    await rm(workDir, { recursive: true, force: true })
    throw createError({ statusCode: 404, statusMessage: 'EPUB not found' })
  }

  const filePath = join(workDir, epubFile)
  const fileBuffer = await readFile(filePath)

  await rm(workDir, { recursive: true, force: true })

  event.node.res.setHeader('Content-Type', 'application/epub+zip')
  event.node.res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(epubFile)}"`,
  )
  event.node.res.setHeader('Content-Length', String(fileBuffer.byteLength))

  return fileBuffer
})
