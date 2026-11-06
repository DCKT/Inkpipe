import { Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"
import {
  Command,
  click,
  expect as sceneExpect,
  given,
  role,
  scene,
  selector,
  text,
} from "foldkit/scene"
import { describe, expect, test } from "vitest"

import * as Push from "./push"

const detected = (status: "Unsupported" | "Denied" | "Default" | "Subscribed"): Push.Model =>
  Push.update(Push.init(), Push.Message.CompletedDetectStatus({ status })).model

describe("update", () => {
  test("starts unknown, and refresh checks the browser", () => {
    expect(Push.init().maybeStatus).toStrictEqual(Option.none())
    expect(Push.refresh(Push.init()).commands?.map((c) => c.name)).toStrictEqual([
      "DetectPushStatus",
    ])
  })

  test("enabling is single-flight and clears an old error", () => {
    const failed = Push.update(detected("Default"), Push.Message.FailedPush({ reason: "x" })).model
    const started = Push.update(failed, Push.Message.ClickedEnable())
    expect(started.model.isWorking).toBe(true)
    expect(started.model.maybeError).toStrictEqual(Option.none())
    expect(started.commands?.map((c) => c.name)).toStrictEqual(["EnablePush"])
    expect(Push.update(started.model, Push.Message.ClickedEnable()).commands ?? []).toHaveLength(0)
    expect(Push.update(started.model, Push.Message.ClickedDisable()).commands ?? []).toHaveLength(0)
  })

  test("the outcome of enabling becomes the status", () => {
    const working = Push.update(detected("Default"), Push.Message.ClickedEnable()).model
    expect(
      Push.update(working, Push.Message.SucceededEnable({ status: "Subscribed" })).model
        .maybeStatus,
    ).toStrictEqual(Option.some("Subscribed"))
    expect(
      Push.update(working, Push.Message.SucceededEnable({ status: "Denied" })).model.maybeStatus,
    ).toStrictEqual(Option.some("Denied"))
    expect(
      Push.update(working, Push.Message.SucceededEnable({ status: "Denied" })).model.isWorking,
    ).toBe(false)
  })

  test("turning off re-reads the browser's status", () => {
    const working = Push.update(detected("Subscribed"), Push.Message.ClickedDisable())
    expect(working.commands?.map((c) => c.name)).toStrictEqual(["DisablePush"])
    const done = Push.update(working.model, Push.Message.SucceededDisable())
    expect(done.model.isWorking).toBe(false)
    expect(done.commands?.map((c) => c.name)).toStrictEqual(["DetectPushStatus"])
  })

  test("a failure is kept for the banner and unlocks the buttons", () => {
    const working = Push.update(detected("Default"), Push.Message.ClickedEnable()).model
    const failed = Push.update(
      working,
      Push.Message.FailedPush({ reason: "no service worker" }),
    ).model
    expect(failed.isWorking).toBe(false)
    expect(failed.maybeError).toStrictEqual(Option.some("no service worker"))
  })
})

const harness = {
  update: (model: Push.Model, message: Push.Message) => Push.update(model, message),
  view: (model: Push.Model, h: HtmlBuilder<Push.Message>): Html =>
    h.submodel({ slotId: "push", model, view: Push.view, toParentMessage: (message) => message }),
}

describe("view", () => {
  test("shows nothing until the status is known, and nothing when unsupported", () => {
    scene(harness, given(Push.init()), sceneExpect(selector("[data-push]")).toBeAbsent())
    scene(
      harness,
      given(detected("Unsupported")),
      sceneExpect(selector("[data-push]")).toBeAbsent(),
    )
  })

  test("Default offers to enable, and locks while enabling", () => {
    scene(
      harness,
      given(detected("Default")),
      sceneExpect(text("Get notified when new matches are found")).toExist(),
      sceneExpect(role("button", { name: "Enable alerts" })).toBeEnabled(),
      click(role("button", { name: "Enable alerts" })),
      sceneExpect(role("button", { name: "Enabling..." })).toBeDisabled(),
      Command.resolve(Push.EnablePush, Push.Message.SucceededEnable({ status: "Subscribed" })),
      sceneExpect(text("Notifications on")).toExist(),
    )
  })

  test("Subscribed says so and offers Turn off", () => {
    scene(
      harness,
      given(detected("Subscribed")),
      sceneExpect(text("Notifications on")).toExist(),
      sceneExpect(role("button", { name: "Turn off" })).toBeEnabled(),
    )
  })

  test("Denied explains how to unblock", () => {
    scene(
      harness,
      given(detected("Denied")),
      sceneExpect(
        text("Notifications blocked. Allow them in your browser settings to receive alerts."),
      ).toExist(),
      sceneExpect(role("button", { name: "Enable alerts" })).toBeAbsent(),
    )
  })

  test("a failure is shown to the user", () => {
    const failed = Push.update(
      detected("Default"),
      Push.Message.FailedPush({ reason: "no service worker" }),
    ).model
    scene(
      harness,
      given(failed),
      sceneExpect(role("alert")).toContainText("Couldn't update notifications: no service worker"),
    )
  })
})
