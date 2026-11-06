// Test-only fixtures for watches.
import { type Watch, WatchId, WatchSchema } from "@inkpipe/shared"
import { Option, Schema } from "effect"

const decodeWatch = Schema.decodeUnknownOption(WatchSchema)

export const makeWatch = (overrides: Partial<Record<keyof Watch, unknown>> = {}): Watch =>
  Option.getOrThrowWith(
    decodeWatch({
      id: 1,
      name: "One Piece",
      enabled: true,
      query: "one piece",
      intervalSeconds: 3600,
      filterGroups: [{ mode: "AND", substrings: ["color"] }],
      subfolder: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    }),
    () => new globalThis.Error("invalid watch fixture"),
  )

const decodeWatchId = Schema.decodeUnknownOption(WatchId)

/** A branded watch id for tests. */
export const wid = (id: number): WatchId =>
  Option.getOrThrowWith(decodeWatchId(id), () => new globalThis.Error("invalid watch id"))
