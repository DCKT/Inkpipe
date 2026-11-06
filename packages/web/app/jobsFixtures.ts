// Test-only fixtures for the jobs feature.
import { type Job, JobSchema } from "@inkpipe/shared"
import { Option, Schema } from "effect"

const decodeJob = Schema.decodeUnknownOption(JobSchema)

export const makeJob = (overrides: Partial<Record<keyof Job, unknown>> = {}): Job =>
  Option.getOrThrowWith(
    decodeJob({
      id: 1,
      title: "Berserk v01",
      stage: "DOWNLOADING",
      progress: 40,
      startedAt: 1_000_000,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    }),
    () => new globalThis.Error("invalid job fixture"),
  )
