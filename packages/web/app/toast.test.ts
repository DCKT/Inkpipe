import { Option } from "effect"
import { describe, expect, test } from "vitest"

import { Duration } from "effect"
import { durationFor, toShowInput, toast } from "./toast"

describe("toast request helpers", () => {
  test("each helper sets its variant", () => {
    expect(toast.info("a").variant).toBe("Info")
    expect(toast.success("a").variant).toBe("Success")
    expect(toast.warning("a").variant).toBe("Warning")
    expect(toast.error("a").variant).toBe("Error")
  })

  test("description is optional and becomes an Option", () => {
    expect(toast.success("Saved").maybeDescription).toStrictEqual(Option.none())
    expect(toast.success("Saved", "Settings updated").maybeDescription).toStrictEqual(
      Option.some("Settings updated"),
    )
  })

  test("an empty description is treated as no description", () => {
    expect(toast.error("Failed", "").maybeDescription).toStrictEqual(Option.none())
  })

  test("success toasts are brief, everything else lingers (parity with the old Ark toaster)", () => {
    expect(durationFor("Success")).toStrictEqual(Duration.seconds(2))
    for (const variant of ["Info", "Warning", "Error"] as const) {
      expect(durationFor(variant)).toStrictEqual(Duration.seconds(5))
    }
  })

  test("toShowInput maps a request onto the Toast component's input", () => {
    expect(toShowInput(toast.error("Failed", "boom"))).toStrictEqual({
      variant: "Error",
      duration: Duration.seconds(5),
      payload: { title: "Failed", maybeDescription: Option.some("boom") },
    })
  })
})
