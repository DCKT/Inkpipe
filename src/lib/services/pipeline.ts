import { join } from 'node:path'
import { loadConfig } from '../config'
import { createJob, updateJob } from '../jobs'
import { uploadMagnet, getMagnetStatus, getMagnetFiles, unlockLink, downloadFile, deleteMagnet } from '../api/alldebrid'
import { convertWithKcc } from './kcc'
import { uploadToCopyparty } from '../api/copyparty'
import { ensureJobDir, cleanupJobDir, findFileByExtension } from './fileManager'
import type { ProwlarrResult } from '../api/prowlarr'

const POLL_INTERVAL = 3000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runPipeline(result: ProwlarrResult): Promise<void> {
  console.log('[pipeline] Starting pipeline for:', result.title)
  console.log('[pipeline] magnetUrl:', result.magnetUrl)
  console.log('[pipeline] downloadUrl:', result.downloadUrl)

  const config = await loadConfig()
  const magnetOrUrl = result.magnetUrl ?? result.downloadUrl
  if (!magnetOrUrl) {
    console.error('[pipeline] No magnet or download URL for:', result.title)
    throw new Error(`No magnet or download URL for "${result.title}"`)
  }

  const job = createJob(result.title)
  console.log('[pipeline] Created job:', job.id, 'for:', result.title)

  let magnetId: number | null = null

  try {
    // Stage 1: Upload magnet to AllDebrid
    console.log('[pipeline] [job %s] Stage: UPLOADING', job.id)
    updateJob(job.id, { stage: 'UPLOADING', progress: 0 })
    const upload = await uploadMagnet(magnetOrUrl, config)
    magnetId = upload.id
    console.log('[pipeline] [job %s] Magnet uploaded, id: %d, ready: %s', job.id, upload.id, upload.ready)

    // Stage 2: Wait until ready (skip polling if already ready at upload)
    if (!upload.ready) {
      console.log('[pipeline] [job %s] Stage: DEBRID_PROCESSING', job.id)
      updateJob(job.id, { stage: 'DEBRID_PROCESSING', progress: 0 })
      let pollCount = 0
      while (true) {
        pollCount++
        const status = await getMagnetStatus(upload.id, config)
        if (status.ready) {
          console.log('[pipeline] [job %s] Debrid ready after %d polls', job.id, pollCount)
          break
        }
        if (status.statusCode >= 5) {
          throw new Error(`AllDebrid magnet error: ${status.status} (code ${status.statusCode})`)
        }
        console.log('[pipeline] [job %s] Debrid not ready (poll #%d, status: %s), waiting...', job.id, pollCount, status.status)
        await sleep(POLL_INTERVAL)
      }
    } else {
      console.log('[pipeline] [job %s] Already ready at upload, skipping poll', job.id)
    }

    // Stage 2b: Fetch file links via v4/magnet/files
    const debridFiles = await getMagnetFiles(upload.id, config)
    console.log('[pipeline] [job %s] Got %d files from AllDebrid', job.id, debridFiles.length)

    if (debridFiles.length === 0) {
      throw new Error('No files returned from AllDebrid')
    }

    // Stage 3: Download files
    console.log('[pipeline] [job %s] Stage: DOWNLOADING (%d files)', job.id, debridFiles.length)
    updateJob(job.id, { stage: 'DOWNLOADING', progress: 0 })
    const jobDir = await ensureJobDir(job.id, config)
    console.log('[pipeline] [job %s] Job dir: %s', job.id, jobDir)

    for (let i = 0; i < debridFiles.length; i++) {
      const file = debridFiles[i]
      console.log('[pipeline] [job %s] Unlocking file %d/%d: %s', job.id, i + 1, debridFiles.length, file.filename)
      const unlocked = await unlockLink(file.link, config)
      const destPath = join(jobDir, unlocked.filename)
      console.log('[pipeline] [job %s] Downloading to: %s (%d bytes)', job.id, destPath, unlocked.size)
      await downloadFile(unlocked.url, destPath, (received, total) => {
        if (total > 0) {
          updateJob(job.id, { progress: Math.round((received / total) * 100) })
        }
      })
    }

    // Stage 4: Convert to EPUB if needed
    const epubFile = await findFileByExtension(jobDir, ['.epub'])
    if (!epubFile) {
      console.log('[pipeline] [job %s] Stage: CONVERTING', job.id)
      updateJob(job.id, { stage: 'CONVERTING', progress: 0 })
      const cbzFile = await findFileByExtension(jobDir, ['.cbz', '.cbr', '.zip', '.rar', '.pdf'])
      if (cbzFile) {
        console.log('[pipeline] [job %s] Converting: %s', job.id, cbzFile)
        await convertWithKcc(cbzFile, jobDir, config)
        console.log('[pipeline] [job %s] Conversion complete', job.id)
      } else {
        console.log('[pipeline] [job %s] No convertible file found, skipping conversion', job.id)
      }
    } else {
      console.log('[pipeline] [job %s] Already an EPUB, skipping conversion: %s', job.id, epubFile)
    }

    // Stage 5: Upload to Copyparty (if configured)
    if (config.copyparty.url) {
      console.log('[pipeline] [job %s] Stage: UPLOADING_COPYPARTY', job.id)
      updateJob(job.id, { stage: 'UPLOADING_COPYPARTY', progress: 0 })

      // Find the final file to upload (prefer epub, then cbz/cbr, then anything)
      const finalEpub = await findFileByExtension(jobDir, ['.epub'])
      const finalFile = finalEpub
        ?? await findFileByExtension(jobDir, ['.cbz', '.cbr'])
        ?? await findFileByExtension(jobDir, ['.zip', '.rar', '.pdf'])

      if (finalFile) {
        console.log('[pipeline] [job %s] Uploading to Copyparty: %s', job.id, finalFile)
        await uploadToCopyparty(finalFile, config)
        console.log('[pipeline] [job %s] Copyparty upload complete', job.id)
      } else {
        console.log('[pipeline] [job %s] No file found to upload to Copyparty', job.id)
      }
    } else {
      console.log('[pipeline] [job %s] Copyparty not configured, skipping upload', job.id)
    }

    // Done
    console.log('[pipeline] [job %s] Stage: DONE', job.id)
    updateJob(job.id, { stage: 'DONE', progress: 100 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[pipeline] [job %s] FAILED:', job.id, message)
    if (err instanceof Error && err.stack) {
      console.error('[pipeline] [job %s] Stack:', job.id, err.stack)
    }
    updateJob(job.id, {
      stage: 'FAILED',
      error: message,
    })
  } finally {
    // Cleanup: remove temp files and AllDebrid magnet regardless of outcome
    console.log('[pipeline] [job %s] Cleaning up', job.id)
    await cleanupJobDir(job.id, config)
    if (magnetId !== null) {
      await deleteMagnet(magnetId, config)
    }
  }
}
