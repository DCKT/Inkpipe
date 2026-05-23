import { createServerFn } from '@tanstack/react-start'
import { loadConfig } from '../../lib/config'
import { listAllSeries, listLibraries, getBooksForSeries, getSeriesThumbnail, type KomgaSeries, type KomgaBook, type KomgaLibrary } from '../../lib/api/komga'

export const getKomgaLibrariesFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<KomgaLibrary[]> => {
    const config = await loadConfig()
    return listLibraries(config)
  })

export const getKomgaSeriesFn = createServerFn({ method: 'GET' })
  .inputValidator((input: { libraryId?: string }) => input)
  .handler(async ({ data }): Promise<KomgaSeries[]> => {
    const config = await loadConfig()
    return listAllSeries(config, data.libraryId || undefined)
  })

export const getKomgaBooksForSeriesFn = createServerFn({ method: 'GET' })
  .inputValidator((input: { seriesId: string }) => input)
  .handler(async ({ data }): Promise<KomgaBook[]> => {
    const config = await loadConfig()
    return getBooksForSeries(data.seriesId, config)
  })

export const getKomgaSeriesThumbnailFn = createServerFn({ method: 'GET' })
  .inputValidator((input: { seriesId: string }) => input)
  .handler(async ({ data }): Promise<string> => {
    const config = await loadConfig()
    return getSeriesThumbnail(data.seriesId, config)
  })
