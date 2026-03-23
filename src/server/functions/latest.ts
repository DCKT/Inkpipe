import { createServerFn } from '@tanstack/react-start'
import { loadConfig } from '../../lib/config'
import { getLatestMangas, type ProwlarrResult } from '../../lib/api/prowlarr'

export const latestMangasFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<ProwlarrResult[]> => {
    const config = await loadConfig()
    return getLatestMangas(config)
  })
