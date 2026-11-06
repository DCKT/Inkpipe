import { Effect, Option, Schema } from "effect"

import { type ApiClientService, ApiFailure, bases, callApi } from "./api"

// The three steps of a conversion, as separate effects: upload the file, wait
// for the server to report that KCC finished, then fetch the result.

export const progressUrl = (baseUrl: string, id: string): string =>
  `${baseUrl}/api/convert/progress?id=${encodeURIComponent(id)}`

export const resultPath = (id: string): string =>
  `/api/convert/download?id=${encodeURIComponent(id)}`

const SseMessage = Schema.fromJsonString(Schema.Struct({ message: Schema.String }))
const decodeSseMessage = Schema.decodeUnknownOption(SseMessage)

/** The `message` of a server-sent `done`/`error` event, if its data is well formed. */
export const parseSseMessage = (data: unknown): Option.Option<string> =>
  typeof data === "string"
    ? Option.map(decodeSseMessage(data), ({ message }) => message)
    : Option.none()

/** Send the .cbz (and the KCC options as JSON) to start a conversion; resolves to its id. */
export const uploadFile = (
  file: File,
  options: Option.Option<string>,
): Effect.Effect<string, ApiFailure, ApiClientService> => {
  const formData = new FormData()
  formData.append("file", file)
  Option.map(options, (value) => formData.append("options", value))

  return callApi((client) => client.convert.start({ payload: formData })).pipe(
    Effect.map(({ id }) => id),
  )
}

export interface EventSourceLike {
  addEventListener(type: "done" | "error", listener: (event: Event) => void): void
  close(): void
}

/**
 * Resolves with the converted file's name when the server sends `done`, and
 * fails with the server's message on `error` (or a generic one if the
 * connection drops first). The connection is closed however this ends.
 */
export const awaitConversion = (
  id: string,
  openEventSource: (url: string) => EventSourceLike = (url) => new EventSource(url),
): Effect.Effect<string, ApiFailure> =>
  Effect.callback<string, ApiFailure>((resume) => {
    const source = openEventSource(progressUrl(bases.http, id))
    const finish = (effect: Effect.Effect<string, ApiFailure>) => {
      source.close()
      resume(effect)
    }

    source.addEventListener("done", (event) => {
      finish(
        Option.match(parseSseMessage(event instanceof MessageEvent ? event.data : undefined), {
          onNone: () =>
            Effect.fail(new ApiFailure({ message: "Unexpected response from the converter" })),
          onSome: (filename) => Effect.succeed(filename),
        }),
      )
    })

    // The server's own `error` event carries data; a dropped connection does not.
    source.addEventListener("error", (event) => {
      finish(
        Effect.fail(
          new ApiFailure({
            message: Option.getOrElse(
              parseSseMessage(event instanceof MessageEvent ? event.data : undefined),
              () => "Connection lost during conversion",
            ),
          }),
        ),
      )
    })

    return Effect.sync(() => source.close())
  })

/** Fetch the converted EPUB. */
export const fetchResult = (id: string): Effect.Effect<Blob, ApiFailure> =>
  Effect.tryPromise({
    try: () => fetch(`${bases.http}${resultPath(id)}`),
    catch: () => new ApiFailure({ message: "Could not reach the server" }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.tryPromise({
            try: () => response.blob(),
            catch: () => new ApiFailure({ message: "Could not read the converted file" }),
          })
        : Effect.fail(new ApiFailure({ message: `The server answered ${response.status}` })),
    ),
  )
