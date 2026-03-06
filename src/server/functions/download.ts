import { createServerFn } from '@tanstack/react-start'
import { runPipeline } from '../../lib/services/pipeline'
import type { ProwlarrResult } from '../../lib/api/prowlarr'

export const startDownloadFn = createServerFn({ method: 'POST' })
  .inputValidator((input: { items: ProwlarrResult[] }) => input)
  .handler(async ({ data }) => {
    // Fire-and-forget: start pipelines in parallel without blocking the response
    for (const item of data.items) {
      runPipeline(item).catch(() => {
        // errors are captured in the job state
      })
    }
    return { started: data.items.length }
  })
