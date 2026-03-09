import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { runPipeline } from './pipeline'
import { getJob, getAllJobs, type Job } from '../jobs'
import type { ProwlarrResult } from '../api/prowlarr'
import type { AppConfig } from '../config'

// Mock all external dependencies
vi.mock('../config', () => ({
  loadConfig: vi.fn(),
}))

vi.mock('../api/alldebrid', () => ({
  uploadMagnet: vi.fn(),
  getMagnetStatus: vi.fn(),
  getMagnetFiles: vi.fn(),
  unlockLink: vi.fn(),
  downloadFile: vi.fn(),
  deleteMagnet: vi.fn(),
}))

vi.mock('./kcc', () => ({
  convertWithKcc: vi.fn(),
}))

vi.mock('../api/copyparty', () => ({
  uploadToCopyparty: vi.fn(),
}))

vi.mock('./fileManager', () => ({
  ensureJobDir: vi.fn(),
  cleanupJobDir: vi.fn(),
  findFileByExtension: vi.fn(),
  findAllFilesByExtension: vi.fn(),
  extractRarArchive: vi.fn(),
}))

import { loadConfig } from '../config'
import { uploadMagnet, getMagnetStatus, getMagnetFiles, unlockLink, downloadFile, deleteMagnet } from '../api/alldebrid'
import { convertWithKcc } from './kcc'
import { uploadToCopyparty } from '../api/copyparty'
import { ensureJobDir, cleanupJobDir, findFileByExtension, findAllFilesByExtension, extractRarArchive } from './fileManager'

const mockConfig: AppConfig = {
  prowlarr: { url: 'http://localhost:9696', apiKey: 'test-key' },
  alldebrid: { apiKey: 'test-debrid-key' },
  kcc: { dockerImage: 'ghcr.io/ciromattia/kcc:latest', profile: 'KoBO' },
  copyparty: { url: '', uploadPath: '/', password: '' },
  tempDir: '/tmp/inkpipe-test',
}

const baseProwlarrResult: ProwlarrResult = {
  title: 'Naruto T01',
  guid: 'test-guid-123',
  magnetUrl: 'magnet:?xt=urn:btih:abc123',
  downloadUrl: null,
  size: 100000000,
  seeders: 10,
  indexer: 'test-indexer',
  categories: ['Comics'],
}

// Get the job created during the current test (highest ID)
function latestJob(): Job {
  const jobs = getAllJobs()
  // Jobs have incrementing string IDs, sort numerically descending
  return jobs.sort((a, b) => Number(b.id) - Number(a.id))[0]
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(loadConfig).mockResolvedValue(mockConfig)
  vi.mocked(ensureJobDir).mockResolvedValue('/tmp/inkpipe-test/1')
  vi.mocked(cleanupJobDir).mockResolvedValue(undefined)
  vi.mocked(findAllFilesByExtension).mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('pipeline', () => {
  describe('full success: magnet already ready, cbz needs conversion', () => {
    it('goes UPLOADING → DOWNLOADING → CONVERTING → DONE', async () => {
      vi.mocked(uploadMagnet).mockResolvedValue({ id: 123, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'Naruto.T01.cbz', link: 'https://alldebrid.com/f/abc', size: 100000000 },
      ])
      vi.mocked(unlockLink).mockResolvedValue({
        url: 'https://cdn.example.com/Naruto.T01.cbz',
        filename: 'Naruto.T01.cbz',
        size: 100000000,
      })
      vi.mocked(downloadFile).mockResolvedValue(undefined)
      vi.mocked(findFileByExtension).mockResolvedValueOnce(null) // no epub found
      vi.mocked(findAllFilesByExtension).mockResolvedValueOnce(['/tmp/inkpipe-test/1/Naruto.T01.cbz'])
      vi.mocked(convertWithKcc).mockResolvedValue('OK')

      await runPipeline(baseProwlarrResult)

      const job = latestJob()
      expect(job.stage).toBe('DONE')
      expect(job.progress).toBe(100)
      expect(job.error).toBeUndefined()

      expect(uploadMagnet).toHaveBeenCalledWith('magnet:?xt=urn:btih:abc123', mockConfig)
      expect(getMagnetStatus).not.toHaveBeenCalled()
      expect(getMagnetFiles).toHaveBeenCalledWith(123, mockConfig)
      expect(unlockLink).toHaveBeenCalledWith('https://alldebrid.com/f/abc', mockConfig)
      expect(downloadFile).toHaveBeenCalled()
      expect(convertWithKcc).toHaveBeenCalledWith(
        '/tmp/inkpipe-test/1/Naruto.T01.cbz',
        '/tmp/inkpipe-test/1',
        mockConfig,
      )
      expect(cleanupJobDir).toHaveBeenCalled()
      expect(deleteMagnet).toHaveBeenCalledWith(123, mockConfig)
    })
  })

  describe('debrid polling', () => {
    it('polls getMagnetStatus until ready then proceeds', async () => {
      vi.mocked(uploadMagnet).mockResolvedValue({ id: 456, ready: false })
      vi.mocked(getMagnetStatus)
        .mockResolvedValueOnce({ ready: false, statusCode: 1, status: 'Downloading' })
        .mockResolvedValueOnce({ ready: false, statusCode: 2, status: 'Downloading' })
        .mockResolvedValueOnce({ ready: true, statusCode: 4, status: 'Ready' })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'file.cbz', link: 'https://alldebrid.com/f/xyz', size: 5000 },
      ])
      vi.mocked(unlockLink).mockResolvedValue({
        url: 'https://cdn.example.com/file.cbz',
        filename: 'file.cbz',
        size: 5000,
      })
      vi.mocked(downloadFile).mockResolvedValue(undefined)
      vi.mocked(findFileByExtension).mockResolvedValue(null)
      vi.mocked(convertWithKcc).mockResolvedValue('OK')

      // Run pipeline and advance timers for each sleep(3000)
      const promise = runPipeline(baseProwlarrResult)
      await vi.advanceTimersByTimeAsync(3000) // poll 1 → not ready, sleep
      await vi.advanceTimersByTimeAsync(3000) // poll 2 → not ready, sleep
      await vi.advanceTimersByTimeAsync(3000) // poll 3 → ready
      await promise

      expect(getMagnetStatus).toHaveBeenCalledTimes(3)
      const job = latestJob()
      expect(job.stage).toBe('DONE')
    })

    it('fails fast on debrid error status code >= 5', async () => {
      vi.mocked(uploadMagnet).mockResolvedValue({ id: 789, ready: false })
      vi.mocked(getMagnetStatus).mockResolvedValue({
        ready: false,
        statusCode: 7,
        status: 'Virus detected',
      })

      await runPipeline(baseProwlarrResult)

      const job = latestJob()
      expect(job.stage).toBe('FAILED')
      expect(job.error).toContain('Virus detected')
      expect(job.error).toContain('code 7')
    })
  })

  describe('torrent URL fallback', () => {
    it('uses downloadUrl when magnetUrl is null', async () => {
      const result: ProwlarrResult = {
        ...baseProwlarrResult,
        magnetUrl: null,
        downloadUrl: 'http://prowlarr/download/torrent.torrent',
      }

      vi.mocked(uploadMagnet).mockResolvedValue({ id: 100, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'file.epub', link: 'https://alldebrid.com/f/aaa', size: 3000 },
      ])
      vi.mocked(unlockLink).mockResolvedValue({
        url: 'https://cdn.example.com/file.epub',
        filename: 'file.epub',
        size: 3000,
      })
      vi.mocked(downloadFile).mockResolvedValue(undefined)
      vi.mocked(findFileByExtension).mockResolvedValueOnce('/tmp/inkpipe-test/1/file.epub')

      await runPipeline(result)

      expect(uploadMagnet).toHaveBeenCalledWith(
        'http://prowlarr/download/torrent.torrent',
        mockConfig,
      )
      const job = latestJob()
      expect(job.stage).toBe('DONE')
    })
  })

  describe('no URL available', () => {
    it('throws when both magnetUrl and downloadUrl are null', async () => {
      const result: ProwlarrResult = {
        ...baseProwlarrResult,
        magnetUrl: null,
        downloadUrl: null,
      }

      await expect(runPipeline(result)).rejects.toThrow('No magnet or download URL')
    })
  })

  describe('epub skip conversion', () => {
    it('skips KCC when downloaded file is already an epub', async () => {
      vi.mocked(uploadMagnet).mockResolvedValue({ id: 200, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'book.epub', link: 'https://alldebrid.com/f/bbb', size: 5000 },
      ])
      vi.mocked(unlockLink).mockResolvedValue({
        url: 'https://cdn.example.com/book.epub',
        filename: 'book.epub',
        size: 5000,
      })
      vi.mocked(downloadFile).mockResolvedValue(undefined)
      vi.mocked(findFileByExtension).mockResolvedValueOnce('/tmp/inkpipe-test/1/book.epub')

      await runPipeline(baseProwlarrResult)

      expect(convertWithKcc).not.toHaveBeenCalled()
      const job = latestJob()
      expect(job.stage).toBe('DONE')
    })
  })

  describe('multiple files', () => {
    it('downloads and unlocks all files from debrid', async () => {
      vi.mocked(uploadMagnet).mockResolvedValue({ id: 300, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'part1.cbz', link: 'https://alldebrid.com/f/p1', size: 1000 },
        { filename: 'part2.cbz', link: 'https://alldebrid.com/f/p2', size: 2000 },
      ])
      vi.mocked(unlockLink)
        .mockResolvedValueOnce({ url: 'https://cdn.example.com/part1.cbz', filename: 'part1.cbz', size: 1000 })
        .mockResolvedValueOnce({ url: 'https://cdn.example.com/part2.cbz', filename: 'part2.cbz', size: 2000 })
      vi.mocked(downloadFile).mockResolvedValue(undefined)
      vi.mocked(findFileByExtension).mockResolvedValue(null)
      vi.mocked(findAllFilesByExtension).mockResolvedValueOnce([
        '/tmp/inkpipe-test/1/part1.cbz',
        '/tmp/inkpipe-test/1/part2.cbz',
      ])
      vi.mocked(convertWithKcc).mockResolvedValue('OK')

      await runPipeline(baseProwlarrResult)

      expect(unlockLink).toHaveBeenCalledTimes(2)
      expect(downloadFile).toHaveBeenCalledTimes(2)
    })

    it('converts all comic files with KCC', async () => {
      vi.mocked(uploadMagnet).mockResolvedValue({ id: 301, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'vol1.cbz', link: 'https://alldebrid.com/f/v1', size: 1000 },
        { filename: 'vol2.cbz', link: 'https://alldebrid.com/f/v2', size: 2000 },
      ])
      vi.mocked(unlockLink)
        .mockResolvedValueOnce({ url: 'https://cdn.example.com/vol1.cbz', filename: 'vol1.cbz', size: 1000 })
        .mockResolvedValueOnce({ url: 'https://cdn.example.com/vol2.cbz', filename: 'vol2.cbz', size: 2000 })
      vi.mocked(downloadFile).mockResolvedValue(undefined)
      vi.mocked(findFileByExtension).mockResolvedValue(null)
      vi.mocked(findAllFilesByExtension).mockResolvedValueOnce([
        '/tmp/inkpipe-test/1/vol1.cbz',
        '/tmp/inkpipe-test/1/vol2.cbz',
      ])
      vi.mocked(convertWithKcc).mockResolvedValue('OK')

      await runPipeline(baseProwlarrResult)

      expect(convertWithKcc).toHaveBeenCalledTimes(2)
      expect(convertWithKcc).toHaveBeenCalledWith('/tmp/inkpipe-test/1/vol1.cbz', '/tmp/inkpipe-test/1', mockConfig)
      expect(convertWithKcc).toHaveBeenCalledWith('/tmp/inkpipe-test/1/vol2.cbz', '/tmp/inkpipe-test/1', mockConfig)
      const job = latestJob()
      expect(job.stage).toBe('DONE')
    })

    it('extracts cbr/rar files before passing to KCC', async () => {
      vi.mocked(uploadMagnet).mockResolvedValue({ id: 302, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'comic.cbr', link: 'https://alldebrid.com/f/r1', size: 3000 },
      ])
      vi.mocked(unlockLink).mockResolvedValue({
        url: 'https://cdn.example.com/comic.cbr',
        filename: 'comic.cbr',
        size: 3000,
      })
      vi.mocked(downloadFile).mockResolvedValue(undefined)
      vi.mocked(findFileByExtension).mockResolvedValue(null)
      vi.mocked(findAllFilesByExtension).mockResolvedValueOnce(['/tmp/inkpipe-test/1/comic.cbr'])
      vi.mocked(extractRarArchive).mockResolvedValue('/tmp/inkpipe-test/1/comic')
      vi.mocked(convertWithKcc).mockResolvedValue('OK')

      await runPipeline(baseProwlarrResult)

      expect(extractRarArchive).toHaveBeenCalledWith('/tmp/inkpipe-test/1/comic.cbr')
      expect(convertWithKcc).toHaveBeenCalledWith('/tmp/inkpipe-test/1/comic', '/tmp/inkpipe-test/1', mockConfig)
      const job = latestJob()
      expect(job.stage).toBe('DONE')
    })
  })

  describe('copyparty upload', () => {
    it('uploads to Copyparty when configured', async () => {
      const configWithCopyparty: AppConfig = {
        ...mockConfig,
        copyparty: { url: 'http://localhost:3923', uploadPath: '/comics', password: 'secret' },
      }
      vi.mocked(loadConfig).mockResolvedValue(configWithCopyparty)

      vi.mocked(uploadMagnet).mockResolvedValue({ id: 400, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'comic.cbz', link: 'https://alldebrid.com/f/ccc', size: 8000 },
      ])
      vi.mocked(unlockLink).mockResolvedValue({
        url: 'https://cdn.example.com/comic.cbz',
        filename: 'comic.cbz',
        size: 8000,
      })
      vi.mocked(downloadFile).mockResolvedValue(undefined)
      vi.mocked(findFileByExtension).mockResolvedValueOnce(null) // no epub before convert
      vi.mocked(findAllFilesByExtension)
        .mockResolvedValueOnce(['/tmp/inkpipe-test/1/comic.cbz']) // comic files for conversion
        .mockResolvedValueOnce(['/tmp/inkpipe-test/1/comic.epub']) // epubs for copyparty upload
      vi.mocked(convertWithKcc).mockResolvedValue('OK')
      vi.mocked(uploadToCopyparty).mockResolvedValue(undefined)

      await runPipeline(baseProwlarrResult)

      expect(uploadToCopyparty).toHaveBeenCalledWith(
        '/tmp/inkpipe-test/1/comic.epub',
        configWithCopyparty,
      )
      const job = latestJob()
      expect(job.stage).toBe('DONE')
    })

    it('skips Copyparty upload when not configured', async () => {
      vi.mocked(uploadMagnet).mockResolvedValue({ id: 500, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'file.epub', link: 'https://alldebrid.com/f/ddd', size: 4000 },
      ])
      vi.mocked(unlockLink).mockResolvedValue({
        url: 'https://cdn.example.com/file.epub',
        filename: 'file.epub',
        size: 4000,
      })
      vi.mocked(downloadFile).mockResolvedValue(undefined)
      vi.mocked(findFileByExtension).mockResolvedValueOnce('/tmp/inkpipe-test/1/file.epub')

      await runPipeline(baseProwlarrResult)

      expect(uploadToCopyparty).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('marks job as FAILED when uploadMagnet throws', async () => {
      vi.mocked(uploadMagnet).mockRejectedValue(new Error('AllDebrid API down'))

      await runPipeline(baseProwlarrResult)

      const job = latestJob()
      expect(job.stage).toBe('FAILED')
      expect(job.error).toBe('AllDebrid API down')
      // Cleanup still runs but no magnetId to delete
      expect(cleanupJobDir).toHaveBeenCalled()
      expect(deleteMagnet).not.toHaveBeenCalled()
    })

    it('marks job as FAILED when getMagnetFiles returns empty', async () => {
      vi.mocked(uploadMagnet).mockResolvedValue({ id: 600, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([])

      await runPipeline(baseProwlarrResult)

      const job = latestJob()
      expect(job.stage).toBe('FAILED')
      expect(job.error).toBe('No files returned from AllDebrid')
    })

    it('marks job as FAILED when download fails and still cleans up', async () => {
      vi.mocked(uploadMagnet).mockResolvedValue({ id: 700, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'file.cbz', link: 'https://alldebrid.com/f/eee', size: 5000 },
      ])
      vi.mocked(unlockLink).mockResolvedValue({
        url: 'https://cdn.example.com/file.cbz',
        filename: 'file.cbz',
        size: 5000,
      })
      vi.mocked(downloadFile).mockRejectedValue(new Error('Network timeout'))

      await runPipeline(baseProwlarrResult)

      const job = latestJob()
      expect(job.stage).toBe('FAILED')
      expect(job.error).toBe('Network timeout')
      expect(cleanupJobDir).toHaveBeenCalled()
      expect(deleteMagnet).toHaveBeenCalledWith(700, mockConfig)
    })

    it('marks job as FAILED when KCC conversion fails', async () => {
      vi.mocked(uploadMagnet).mockResolvedValue({ id: 800, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'file.cbz', link: 'https://alldebrid.com/f/fff', size: 5000 },
      ])
      vi.mocked(unlockLink).mockResolvedValue({
        url: 'https://cdn.example.com/file.cbz',
        filename: 'file.cbz',
        size: 5000,
      })
      vi.mocked(downloadFile).mockResolvedValue(undefined)
      vi.mocked(findFileByExtension).mockResolvedValueOnce(null)
      vi.mocked(findAllFilesByExtension).mockResolvedValueOnce(['/tmp/inkpipe-test/1/file.cbz'])
      vi.mocked(convertWithKcc).mockRejectedValue(new Error('KCC Docker exited with code 1: segfault'))

      await runPipeline(baseProwlarrResult)

      const job = latestJob()
      expect(job.stage).toBe('FAILED')
      expect(job.error).toContain('KCC Docker exited')
    })

    it('marks job as FAILED when Copyparty upload fails', async () => {
      const configWithCopyparty: AppConfig = {
        ...mockConfig,
        copyparty: { url: 'http://localhost:3923', uploadPath: '/', password: '' },
      }
      vi.mocked(loadConfig).mockResolvedValue(configWithCopyparty)

      vi.mocked(uploadMagnet).mockResolvedValue({ id: 900, ready: true })
      vi.mocked(getMagnetFiles).mockResolvedValue([
        { filename: 'file.epub', link: 'https://alldebrid.com/f/ggg', size: 4000 },
      ])
      vi.mocked(unlockLink).mockResolvedValue({
        url: 'https://cdn.example.com/file.epub',
        filename: 'file.epub',
        size: 4000,
      })
      vi.mocked(downloadFile).mockResolvedValue(undefined)
      vi.mocked(findFileByExtension).mockResolvedValueOnce('/tmp/inkpipe-test/1/file.epub') // epub found, skip convert
      vi.mocked(findAllFilesByExtension).mockResolvedValueOnce(['/tmp/inkpipe-test/1/file.epub']) // copyparty epub search
      vi.mocked(uploadToCopyparty).mockRejectedValue(new Error('Connection refused'))

      await runPipeline(baseProwlarrResult)

      const job = latestJob()
      expect(job.stage).toBe('FAILED')
      expect(job.error).toBe('Connection refused')
    })
  })
})
