export type JobStage =
  | 'UPLOADING'
  | 'DEBRID_PROCESSING'
  | 'DOWNLOADING'
  | 'CONVERTING'
  | 'UPLOADING_COPYPARTY'
  | 'DONE'
  | 'FAILED'

export interface Job {
  id: string
  title: string
  stage: JobStage
  progress: number
  error?: string
  startedAt: number
}

const jobs = new Map<string, Job>()

let nextId = 1

export function createJob(title: string): Job {
  const id = String(nextId++)
  const job: Job = {
    id,
    title,
    stage: 'UPLOADING',
    progress: 0,
    startedAt: Date.now(),
  }
  jobs.set(id, job)
  return job
}

export function updateJob(id: string, update: Partial<Omit<Job, 'id'>>) {
  const job = jobs.get(id)
  if (job) {
    Object.assign(job, update)
  }
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id)
}

export function getAllJobs(): Job[] {
  return Array.from(jobs.values()).sort((a, b) => b.startedAt - a.startedAt)
}

export function removeJob(id: string) {
  jobs.delete(id)
}
