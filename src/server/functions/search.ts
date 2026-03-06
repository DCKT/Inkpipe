import { createServerFn } from '@tanstack/react-start'
import { loadConfig } from '../../lib/config'
import { searchProwlarr, type ProwlarrResult } from '../../lib/api/prowlarr'

export const searchFn = createServerFn({ method: 'GET' })
  .inputValidator((input: { query: string }) => input)
  .handler(async ({ data }): Promise<ProwlarrResult[]> => {
    const config = await loadConfig()
    return searchProwlarr(data.query, config)
  })
