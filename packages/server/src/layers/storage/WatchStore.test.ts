import { Effect, Layer } from "effect"
import { describe, it, expect } from "@effect/vitest"
import { WatchId, WatchAlertId } from "@inkpipe/shared"
import type { Watch } from "@inkpipe/shared"
import { WatchStoreService, WatchStoreServiceLive } from "./WatchStore"
import { makeTestDbLayer } from "../../__mocks__/testDb"

function makeProgram<T, E>(prog: (svc: typeof WatchStoreService.Service) => Effect.Effect<T, E>) {
  return Effect.gen(function* () {
    const svc = yield* WatchStoreService
    return yield* prog(svc)
  }).pipe(Effect.provide(Layer.provide(WatchStoreServiceLive, makeTestDbLayer())))
}

const newWatch = {
  name: "One Piece",
  enabled: true,
  query: "one piece",
  intervalSeconds: 600,
  filterGroups: [] as Watch["filterGroups"],
}

describe("WatchStoreService", () => {
  it.effect("createWatch persists and round-trips filterGroups/enabled through JSON/boolean coercion", () =>
    Effect.gen(function* () {
      const watch = yield* makeProgram((svc) =>
        svc.createWatch({
          ...newWatch,
          filterGroups: [{ mode: "AND", substrings: ["vol", "01"] }],
        }),
      )
      expect(watch.name).toBe("One Piece")
      expect(watch.enabled).toBe(true)
      expect(watch.filterGroups).toEqual([{ mode: "AND", substrings: ["vol", "01"] }])
    }))

  it.effect("getWatch fails with WatchNotFoundError for a nonexistent id", () =>
    Effect.gen(function* () {
      const result = yield* makeProgram((svc) => svc.getWatch(WatchId.make(999999))).pipe(Effect.exit)
      expect(result._tag).toBe("Failure")
      if (result._tag === "Failure") {
        expect(String(result.cause)).toContain("WatchNotFoundError")
      }
    }))

  it.effect("updateWatch fails with WatchNotFoundError for a nonexistent id instead of silently succeeding", () =>
    Effect.gen(function* () {
      const result = yield* makeProgram((svc) =>
        svc.updateWatch(WatchId.make(999999), { name: "renamed" }),
      ).pipe(Effect.exit)
      expect(result._tag).toBe("Failure")
    }))

  it.effect("updateWatch with no recognized fields still returns the current row (checked-existence no-op)", () =>
    Effect.gen(function* () {
      const { created, updated } = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const created = yield* svc.createWatch(newWatch)
          const updated = yield* svc.updateWatch(created.id, {})
          return { created, updated }
        }),
      )
      expect(updated).toEqual(created)
    }))

  it.effect("updateWatch applies only the provided fields", () =>
    Effect.gen(function* () {
      const updated = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const created = yield* svc.createWatch(newWatch)
          return yield* svc.updateWatch(created.id, { enabled: false })
        }),
      )
      expect(updated.enabled).toBe(false)
      expect(updated.name).toBe(newWatch.name)
    }))

  it.effect("deleteWatch removes the watch and cascades its alerts", () =>
    Effect.gen(function* () {
      const { afterDelete, alertsGone } = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const created = yield* svc.createWatch(newWatch)
          yield* svc.insertAlert({
            watchId: created.id, guid: "g1", title: "t", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: false,
          })
          yield* svc.deleteWatch(created.id)
          const afterDelete = yield* svc.getWatch(created.id).pipe(Effect.exit)
          const alertsGone = yield* svc.listAlerts(created.id)
          return { afterDelete, alertsGone }
        }),
      )
      expect(afterDelete._tag).toBe("Failure")
      expect(alertsGone).toEqual([])
    }))

  it.effect("listWatches computes unreadCount via the alerts join, per-watch", () =>
    Effect.gen(function* () {
      const watches = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const withAlerts = yield* svc.createWatch({ ...newWatch, name: "Has Alerts" })
          yield* svc.createWatch({ ...newWatch, name: "No Alerts" })
          yield* svc.insertAlert({
            watchId: withAlerts.id, guid: "g1", title: "t1", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: false,
          })
          yield* svc.insertAlert({
            watchId: withAlerts.id, guid: "g2", title: "t2", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: false,
          })
          // acknowledged alerts don't count as unread
          yield* svc.insertAlert({
            watchId: withAlerts.id, guid: "g3", title: "t3", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: true,
          })
          return yield* svc.listWatches
        }),
      )
      const byName = Object.fromEntries(watches.map((w) => [w.name, w.unreadCount]))
      expect(byName["Has Alerts"]).toBe(2)
      expect(byName["No Alerts"]).toBe(0)
    }))

  it.effect("listEnabledWatches excludes disabled watches", () =>
    Effect.gen(function* () {
      const enabledNames = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          yield* svc.createWatch({ ...newWatch, name: "On", enabled: true })
          yield* svc.createWatch({ ...newWatch, name: "Off", enabled: false })
          const enabled = yield* svc.listEnabledWatches
          return enabled.map((w) => w.name)
        }),
      )
      expect(enabledNames).toEqual(["On"])
    }))

  it.effect("insertAlert dedups by (watchId, guid) via INSERT OR IGNORE", () =>
    Effect.gen(function* () {
      const alerts = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const watch = yield* svc.createWatch(newWatch)
          const alert = {
            watchId: watch.id, guid: "dup", title: "t", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: false,
          }
          yield* svc.insertAlert(alert)
          yield* svc.insertAlert(alert)
          return yield* svc.listAlerts(watch.id)
        }),
      )
      expect(alerts.length).toBe(1)
    }))

  it.effect("hasAlertForGuid reflects dedup state", () =>
    Effect.gen(function* () {
      const { before, after } = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const watch = yield* svc.createWatch(newWatch)
          const before = yield* svc.hasAlertForGuid(watch.id, "g1")
          yield* svc.insertAlert({
            watchId: watch.id, guid: "g1", title: "t", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: false,
          })
          const after = yield* svc.hasAlertForGuid(watch.id, "g1")
          return { before, after }
        }),
      )
      expect(before).toBe(false)
      expect(after).toBe(true)
    }))

  it.effect("acknowledgeAlert flips only the targeted alert", () =>
    Effect.gen(function* () {
      const alerts = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const watch = yield* svc.createWatch(newWatch)
          yield* svc.insertAlert({
            watchId: watch.id, guid: "g1", title: "t1", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: false,
          })
          yield* svc.insertAlert({
            watchId: watch.id, guid: "g2", title: "t2", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: false,
          })
          const [first] = yield* svc.listAlerts(watch.id)
          yield* svc.acknowledgeAlert(watch.id, first.id)
          return yield* svc.listAlerts(watch.id)
        }),
      )
      const ackedCount = alerts.filter((a) => a.acknowledged).length
      expect(ackedCount).toBe(1)
    }))

  it.effect("acknowledgeAlert fails with WatchNotFoundError for a nonexistent alert", () =>
    Effect.gen(function* () {
      const result = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const watch = yield* svc.createWatch(newWatch)
          return yield* svc.acknowledgeAlert(watch.id, WatchAlertId.make(999999))
        }),
      ).pipe(Effect.exit)
      expect(result._tag).toBe("Failure")
    }))

  it.effect("acknowledgeAllAlerts acknowledges every unread alert for a watch, not other watches'", () =>
    Effect.gen(function* () {
      const { targetAlerts, otherAlerts } = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const target = yield* svc.createWatch({ ...newWatch, name: "Target" })
          const other = yield* svc.createWatch({ ...newWatch, name: "Other" })
          yield* svc.insertAlert({
            watchId: target.id, guid: "g1", title: "t", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: false,
          })
          yield* svc.insertAlert({
            watchId: other.id, guid: "g2", title: "t", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: false,
          })
          yield* svc.acknowledgeAllAlerts(target.id)
          return {
            targetAlerts: yield* svc.listAlerts(target.id),
            otherAlerts: yield* svc.listAlerts(other.id),
          }
        }),
      )
      expect(targetAlerts.every((a) => a.acknowledged)).toBe(true)
      expect(otherAlerts.every((a) => !a.acknowledged)).toBe(true)
    }))

  it.effect("getUnreadCount sums unacknowledged alerts across all watches", () =>
    Effect.gen(function* () {
      const count = yield* makeProgram((svc) =>
        Effect.gen(function* () {
          const a = yield* svc.createWatch({ ...newWatch, name: "A" })
          const b = yield* svc.createWatch({ ...newWatch, name: "B" })
          yield* svc.insertAlert({
            watchId: a.id, guid: "g1", title: "t", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: false,
          })
          yield* svc.insertAlert({
            watchId: b.id, guid: "g2", title: "t", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: false,
          })
          yield* svc.insertAlert({
            watchId: b.id, guid: "g3", title: "t", magnetUrl: null,
            size: 0, seeders: 0, indexer: "x", matchedAt: Date.now(), acknowledged: true,
          })
          return yield* svc.getUnreadCount
        }),
      )
      expect(count).toBe(2)
    }))
})
