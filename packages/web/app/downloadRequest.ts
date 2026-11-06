import type { ProwlarrResult } from "@inkpipe/shared"
import { type Effect, Option } from "effect"

import { type ApiClientService, type ApiFailure, callApi } from "./api"

/**
 * Ask the server to download `items`, optionally into a Copyparty subfolder.
 * `newFolder` is only meaningful together with `subfolder`.
 */
export const requestDownload = (
  items: ReadonlyArray<ProwlarrResult>,
  subfolder: Option.Option<string>,
  newFolder: Option.Option<boolean>,
): Effect.Effect<{ readonly started: number }, ApiFailure, ApiClientService> =>
  callApi((client) =>
    client.download.download({
      payload: {
        items,
        ...Option.match(subfolder, {
          onNone: () => ({}),
          onSome: (value) => ({ subfolder: value }),
        }),
        ...Option.match(newFolder, {
          onNone: () => ({}),
          onSome: (value) => ({ newFolder: value }),
        }),
      },
    }),
  )

export const startedToastTitle = (started: number): string => `Started ${started} downloads`

export const STARTED_TOAST_DESCRIPTION = "Check the Jobs page for progress."
