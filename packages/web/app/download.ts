import { Effect } from "effect"

/** Offer `value` to the browser as a pretty-printed JSON file download. */
export const downloadJson = (filename: string, value: unknown): Effect.Effect<void> =>
  Effect.sync(() => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  })

/** Offer `blob` to the browser as a file download named `filename`. */
export const downloadBlob = (filename: string, blob: Blob): Effect.Effect<void> =>
  Effect.sync(() => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  })
