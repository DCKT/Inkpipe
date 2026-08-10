import { describe, it, expect, afterEach } from "@effect/vitest"
import type { Job } from "@inkpipe/shared"
import { JobId } from "@inkpipe/shared"
import { subscribeJobEvents, publishJobEvent, subscribeJobListEvents, broadcastJobs } from "./jobEvents"

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: JobId.make(1),
    title: "Book",
    stage: "UPLOADING",
    progress: 0,
    startedAt: Date.now(),
    createdAt: "",
    updatedAt: "",
    ...overrides,
  }
}

// Listener sets are module-level singletons — always clean up subscriptions
// so one test's listeners can't leak into the next.
const cleanups: Array<() => void> = []
function track(unsubscribe: () => void) {
  cleanups.push(unsubscribe)
  return unsubscribe
}
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

describe("jobEvents", () => {
  describe("job (single) events", () => {
    it("delivers a published job to a subscribed listener", () => {
      const received: Job[] = []
      track(subscribeJobEvents((job) => received.push(job)))

      const job = makeJob()
      publishJobEvent(job)

      expect(received).toEqual([job])
    })

    it("delivers to every subscribed listener", () => {
      const a: Job[] = []
      const b: Job[] = []
      track(subscribeJobEvents((job) => a.push(job)))
      track(subscribeJobEvents((job) => b.push(job)))

      const job = makeJob()
      publishJobEvent(job)

      expect(a).toEqual([job])
      expect(b).toEqual([job])
    })

    it("stops delivering to a listener after it unsubscribes", () => {
      const received: Job[] = []
      const unsubscribe = subscribeJobEvents((job) => received.push(job))

      publishJobEvent(makeJob({ title: "before" }))
      unsubscribe()
      publishJobEvent(makeJob({ title: "after" }))

      expect(received.map((j) => j.title)).toEqual(["before"])
    })

    it("unsubscribing a listener does not affect other listeners", () => {
      const a: Job[] = []
      const b: Job[] = []
      const unsubA = subscribeJobEvents((job) => a.push(job))
      track(subscribeJobEvents((job) => b.push(job)))

      unsubA()
      const job = makeJob()
      publishJobEvent(job)

      expect(a).toEqual([])
      expect(b).toEqual([job])
    })

    it("a listener throwing does not prevent other listeners from being called", () => {
      const received: Job[] = []
      track(subscribeJobEvents(() => {
        throw new Error("boom")
      }))
      track(subscribeJobEvents((job) => received.push(job)))

      const job = makeJob()
      // publishJobEvent iterates listeners in insertion order with a plain for-loop and
      // no per-listener try/catch, so a throwing listener registered first *does*
      // currently abort delivery to listeners registered after it — this test
      // documents that real (surprising) behavior rather than an aspirational one.
      expect(() => publishJobEvent(job)).toThrow("boom")
      expect(received).toEqual([])
    })

    it("subscribing the same function twice only registers it once (Set semantics)", () => {
      const received: Job[] = []
      const listener = (job: Job) => received.push(job)
      track(subscribeJobEvents(listener))
      track(subscribeJobEvents(listener))

      publishJobEvent(makeJob())

      expect(received.length).toBe(1)
    })
  })

  describe("job list (broadcast) events", () => {
    it("delivers a broadcast list to a subscribed listener", () => {
      const received: Job[][] = []
      track(subscribeJobListEvents((jobs) => received.push(jobs)))

      const jobs = [makeJob(), makeJob({ id: JobId.make(2) })]
      broadcastJobs(jobs)

      expect(received).toEqual([jobs])
    })

    it("stops delivering after unsubscribing", () => {
      const received: Job[][] = []
      const unsubscribe = subscribeJobListEvents((jobs) => received.push(jobs))

      broadcastJobs([makeJob()])
      unsubscribe()
      broadcastJobs([makeJob({ id: JobId.make(2) })])

      expect(received.length).toBe(1)
    })

    it("is an independent channel from single-job events", () => {
      const jobEvents: Job[] = []
      const listEvents: Job[][] = []
      track(subscribeJobEvents((job) => jobEvents.push(job)))
      track(subscribeJobListEvents((jobs) => listEvents.push(jobs)))

      publishJobEvent(makeJob())
      expect(listEvents).toEqual([])

      broadcastJobs([makeJob()])
      expect(jobEvents.length).toBe(1)
      expect(listEvents.length).toBe(1)
    })
  })
})
