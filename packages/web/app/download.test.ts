import { Effect } from "effect"
import { afterEach, describe, expect, test, vi } from "vitest"

import { downloadBlob, downloadJson } from "./download"

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

describe("downloadBlob", () => {
  test("clicks a temporary link with the file name, then frees the URL and removes the link", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:epub")
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    const clicked: Array<{ href: string; download: string; attached: boolean }> = []
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({
        href: this.href,
        download: this.download,
        attached: document.body.contains(this),
      })
    })

    await Effect.runPromise(downloadBlob("Berserk.epub", new Blob(["x"])))

    expect(clicked).toStrictEqual([{ href: "blob:epub", download: "Berserk.epub", attached: true }])
    expect(revoke).toHaveBeenCalledWith("blob:epub")
    expect(document.body.querySelector("a[download]")).toBeNull()
  })
})
