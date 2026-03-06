import { createServerFn } from '@tanstack/react-start'
import { getAllJobs, type Job } from '../../lib/jobs'

export const getJobsFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<Job[]> => {
    return getAllJobs()
  })
