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
