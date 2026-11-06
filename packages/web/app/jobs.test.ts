import { describe, expect, test } from "vitest"
import { Option } from "effect"

import {
  STAGE_LABELS,
  applySocketEvent,
  decodeSocketFrame,
  formatElapsed,
  isActiveJob,
  shortId,
} from "./jobs"
import { makeJob } from "./jobsFixtures"

describe("applySocketEvent", () => {
  const a = makeJob({ id: 1, title: "A" })
  const b = makeJob({ id: 2, title: "B" })

  test("init replaces the whole list", () => {
    expect(applySocketEvent([a], { type: "init", jobs: [b] })).toStrictEqual([b])
  })

  test("update replaces a known job in place, keeping order", () => {
    const aDone = makeJob({ id: 1, title: "A", stage: "DONE", progress: 100 })
    expect(applySocketEvent([a, b], { type: "update", job: aDone })).toStrictEqual([aDone, b])
  })

  test("update for an unknown job prepends it", () => {
    expect(applySocketEvent([a], { type: "update", job: b })).toStrictEqual([b, a])
  })
})

describe("isActiveJob", () => {
  test("DONE and FAILED are finished, everything else is active", () => {
    expect(isActiveJob(makeJob({ stage: "DONE" }))).toBe(false)
    expect(isActiveJob(makeJob({ stage: "FAILED" }))).toBe(false)
    for (const stage of [
      "UPLOADING",
      "DEBRID_PROCESSING",
      "DOWNLOADING",
      "CONVERTING",
      "UPLOADING_COPYPARTY",
    ]) {
      expect(isActiveJob(makeJob({ stage }))).toBe(true)
    }
  })
})

describe("labels and formatting", () => {
  test("every stage has a human label", () => {
    expect(Object.keys(STAGE_LABELS).sort()).toStrictEqual([
      "CONVERTING",
      "DEBRID_PROCESSING",
      "DONE",
      "DOWNLOADING",
      "FAILED",
      "UPLOADING",
      "UPLOADING_COPYPARTY",
    ])
  })

  test("shortId pads to four digits", () => {
    expect(shortId(7)).toBe("#0007")
    expect(shortId(12345)).toBe("#12345")
  })

  test("formatElapsed", () => {
    expect(formatElapsed(10_000, 10_000)).toBe("0s")
    expect(formatElapsed(59_999, 0)).toBe("59s")
    expect(formatElapsed(61_000, 0)).toBe("1m 1s")
    expect(formatElapsed(0, 5_000)).toBe("0s")
  })
})

describe("decodeSocketFrame", () => {
  const job = makeJob({ id: 3 })
  const frame = (value: unknown) => JSON.stringify(value)

  test("accepts init and update frames", () => {
    expect(decodeSocketFrame(frame({ type: "init", jobs: [job] }))).toStrictEqual(
      Option.some({ type: "init", jobs: [job] }),
    )
    expect(decodeSocketFrame(frame({ type: "update", job }))).toStrictEqual(
      Option.some({ type: "update", job }),
    )
  })

  test.each([
    ["not json", "{"],
    ["unknown type", frame({ type: "ping" })],
    ["missing jobs", frame({ type: "init" })],
    ["bad stage", frame({ type: "update", job: { ...job, stage: "NOPE" } })],
    ["binary", new ArrayBuffer(4)],
    ["undefined", undefined],
  ])("drops malformed frames: %s", (_name, data) => {
    expect(decodeSocketFrame(data)).toStrictEqual(Option.none())
  })
})
