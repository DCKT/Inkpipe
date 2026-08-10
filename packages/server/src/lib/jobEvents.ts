import type { Job } from "@inkpipe/shared"

type Listener = (job: Job) => void
type ListListener = (jobs: Job[]) => void

const listeners = new Set<Listener>()
const listListeners = new Set<ListListener>()

export function subscribeJobEvents(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function publishJobEvent(job: Job): void {
  for (const listener of listeners) listener(job)
}

export function subscribeJobListEvents(fn: ListListener): () => void {
  listListeners.add(fn)
  return () => listListeners.delete(fn)
}

export function broadcastJobs(jobs: Job[]): void {
  for (const listener of listListeners) listener(jobs)
}
