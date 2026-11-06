import { Dialog } from "@foldkit/ui"
import { Option } from "effect"
import {
  Command,
  Mount,
  click,
  expect as sceneExpect,
  given,
  role,
  scene,
  selector,
  text,
} from "foldkit/scene"
import { describe, test } from "vitest"

import { AppRoute, update, view } from "./main"
import * as Jobs from "./jobs"
import { makeJob } from "./jobsFixtures"
import { modelAt } from "./testing"

const withJobs = (jobs: ReturnType<typeof makeJob>[], nowMillis = 1_000_000 + 125_000) => {
  const base = modelAt(AppRoute.Prowlarr())
  return { ...base, jobs: { ...base.jobs, jobs, nowMillis } }
}

const active = makeJob({ id: 1, title: "Berserk v01", stage: "DOWNLOADING", progress: 40 })
const done = makeJob({
  id: 2,
  title: "Vagabond v03",
  stage: "DONE",
  progress: 100,
  startedAt: 1_000_000,
})
const failed = makeJob({
  id: 3,
  title: "Monster v09",
  stage: "FAILED",
  error: "KCC exploded",
  startedAt: 1_000_000,
})

const openDrawer = [
  click(role("button", { name: /^Toggle jobs/ })),
  Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
  Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
] as const

describe("jobs launcher", () => {
  test("is absent while there are no jobs", () => {
    scene(
      { update, view },
      given(withJobs([])),
      sceneExpect(role("button", { name: /^Toggle jobs/ })).toBeAbsent(),
    )
  })

  test("shows how many jobs are active, not finished ones", () => {
    scene(
      { update, view },
      given(withJobs([active, done, failed])),
      sceneExpect(role("button", { name: /^Toggle jobs/ })).toHaveAttr("aria-expanded", "false"),
      sceneExpect(selector("[data-active-jobs]")).toHaveText("1"),
    )
  })

  test("no badge when every job is finished", () => {
    scene(
      { update, view },
      given(withJobs([done])),
      sceneExpect(selector("[data-active-jobs]")).toBeAbsent(),
    )
  })

  test("the badge caps at 99+", () => {
    const many = Array.from({ length: 120 }, (_, i) => makeJob({ id: i + 1 }))
    scene(
      { update, view },
      given(withJobs(many)),
      sceneExpect(selector("[data-active-jobs]")).toHaveText("99+"),
    )
  })
})

describe("jobs drawer", () => {
  test("shows an empty state when there is nothing left to list", () => {
    const base = withJobs([])
    const emptyOpen = {
      ...base,
      jobs: { ...base.jobs, drawer: { ...base.jobs.drawer, isOpen: true } },
    }
    scene(
      { update, view },
      given(emptyOpen),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      sceneExpect(text("No jobs")).toExist(),
    )
  })

  test("the launcher's accessible name includes how many jobs are active", () => {
    scene(
      { update, view },
      given(withJobs([active, makeJob({ id: 5 }), done])),
      sceneExpect(role("button", { name: "Toggle jobs, 2 active" })).toExist(),
    )
  })

  test("Clean and its confirmation are separate elements, so focus never sits on a removed node", () => {
    scene(
      { update, view },
      given(withJobs([done])),
      ...openDrawer,
      click(role("button", { name: "Clean" })),
      Command.resolve(Jobs.FocusConfirmClean, Jobs.Message.CompletedFocus()),
      sceneExpect(selector("#jobs-clean")).toExist(),
      sceneExpect(selector("#jobs-clean-confirm")).toExist(),
      sceneExpect(selector("#jobs-clean")).toBeDisabled(),
    )
  })

  test("lists active jobs with a progress bar and finished ones with elapsed time", () => {
    scene(
      { update, view },
      given(withJobs([active, done, failed])),
      ...openDrawer,
      sceneExpect(role("dialog", { name: "Jobs" })).toExist(),
      sceneExpect(text("Active · 1")).toExist(),
      sceneExpect(text("Completed · 2")).toExist(),
      sceneExpect(text("Downloading")).toExist(),
      sceneExpect(role("progressbar", { name: "Berserk v01 progress" })).toHaveAttr(
        "aria-valuenow",
        "40",
      ),
      sceneExpect(text("2m 5s")).toExist(),
      sceneExpect(text("KCC exploded")).toExist(),
      sceneExpect(text("#0001")).toExist(),
    )
  })

  test("finished jobs show no progress bar", () => {
    scene(
      { update, view },
      given(withJobs([done])),
      ...openDrawer,
      sceneExpect(role("progressbar")).toBeAbsent(),
      sceneExpect(text("Active · 0")).toBeAbsent(),
    )
  })

  test("Clean asks before removing, and Keep backs out", () => {
    scene(
      { update, view },
      given(withJobs([done, failed])),
      ...openDrawer,
      click(role("button", { name: "Clean" })),
      Command.resolve(Jobs.FocusConfirmClean, Jobs.Message.CompletedFocus()),
      sceneExpect(text("Remove all 2 completed?")).toExist(),
      click(role("button", { name: "Keep" })),
      Command.resolve(Jobs.FocusClean, Jobs.Message.CompletedFocus()),
      sceneExpect(role("button", { name: "Clean" })).toExist(),
      sceneExpect(text("Remove all 2 completed?")).toBeAbsent(),
    )
  })

  test("confirming disables Clean while the request runs, then reports the result", () => {
    scene(
      { update, view },
      given(withJobs([done])),
      ...openDrawer,
      click(role("button", { name: "Clean" })),
      Command.resolve(Jobs.FocusConfirmClean, Jobs.Message.CompletedFocus()),
      click(role("button", { name: "Remove" })),
      Command.resolve(Jobs.FocusClean, Jobs.Message.CompletedFocus()),
      sceneExpect(role("button", { name: "Cleaning…" })).toBeDisabled(),
      Command.resolve(Jobs.ClearJobs, Jobs.Message.SucceededClearJobs({ deleted: 1 })),
      Command.resolve(
        Jobs.FetchJobs,
        Jobs.Message.CompletedFetchJobs({ epoch: 0, maybeJobs: Option.some([]) }),
      ),
      sceneExpect(role("status")).toContainText("Cleared 1 completed job"),
    )
  })

  test("a failed clear is announced inside the drawer", () => {
    const base = withJobs([done])
    const failedModel = {
      ...base,
      jobs: {
        ...base.jobs,
        drawer: { ...base.jobs.drawer, isOpen: true },
        maybeClearStatus: Option.some({
          kind: "error" as const,
          text: "Failed to clear jobs: boom",
        }),
      },
    }
    scene(
      { update, view },
      given(failedModel),
      Mount.resolve(Dialog.AcquireResources, Dialog.Message.SucceededAcquireResources()),
      sceneExpect(role("alert")).toContainText("boom"),
    )
  })
})
