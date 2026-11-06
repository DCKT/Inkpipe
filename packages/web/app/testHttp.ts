// Test-only helpers for inspecting stubbed HTTP requests.
import type { HttpClientRequest } from "effect/http"

/** The JSON a request carried, or `undefined` if it had no JSON-able body. */
export const requestJson = (request: HttpClientRequest.HttpClientRequest | undefined): unknown => {
  const body = request?.body

  if (body === undefined || body._tag !== "Uint8Array") {
    return undefined
  }

  return JSON.parse(new TextDecoder().decode(body.body))
}
