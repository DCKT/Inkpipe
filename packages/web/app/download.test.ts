import { Effect } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"

import { downloadJson } from "./download"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("downloadJson", () => {
  test("clicks a temporary link carrying the file name, then frees the blob URL", async () => {
    const created: Array<Blob> = []
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      created.push(blob as Blob)
      return "blob:fake"
    })
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const clicked: Array<{ href: string; download: string }> = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.href, download: this.download })
    })

    await Effect.runPromise(downloadJson("inkpipe-settings.json", { a: 1 }))

    expect(clicked).toStrictEqual([{ href: "blob:fake", download: "inkpipe-settings.json" }])
    expect(revoke).toHaveBeenCalledWith("blob:fake")
    expect(created).toHaveLength(1)
    expect(created[0]?.type).toBe("application/json")
    expect(await created[0]?.text()).toBe(JSON.stringify({ a: 1 }, null, 2))
  })
})
