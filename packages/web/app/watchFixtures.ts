// Test-only fixtures for watches.
import {
  type Watch,
  type WatchAlert,
  WatchAlertId,
  WatchAlertSchema,
  WatchId,
  WatchSchema,
} from "@inkpipe/shared"
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

const decodeAlert = Schema.decodeUnknownOption(WatchAlertSchema)

export const makeAlert = (overrides: Partial<Record<keyof WatchAlert, unknown>> = {}): WatchAlert =>
  Option.getOrThrowWith(
    decodeAlert({
      id: 10,
      watchId: 1,
      guid: "guid-10",
      title: "One Piece v100",
      magnetUrl: "magnet:?xt=urn:btih:abc",
      downloadUrl: null,
      size: 1048576,
      seeders: 12,
      indexer: "Nyaa",
      matchedAt: 1767225600000,
      acknowledged: false,
      ...overrides,
    }),
    () => new globalThis.Error("invalid alert fixture"),
  )

const decodeAlertId = Schema.decodeUnknownOption(WatchAlertId)

export const aid = (id: number): WatchAlertId =>
  Option.getOrThrowWith(decodeAlertId(id), () => new globalThis.Error("invalid alert id"))
