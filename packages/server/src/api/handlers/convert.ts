import { Effect, Schema, Stream } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { HttpServerResponse } from "effect/unstable/http"
import { copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises"
import { basename, join } from "node:path"
import { randomUUID } from "node:crypto"
import type { KccConfig } from "@inkpipe/shared"
import { ConvertError, KccConfigSchema, NotFoundError } from "@inkpipe/shared"
import { KccService } from "../../layers/integrations/Kcc"
import { FileManagerService } from "../../layers/pipeline/FileManager"
import { InkpipeApi } from "@inkpipe/shared"

type ConvertJob = {
  status: "running" | "done" | "error"
  filename?: string
  error?: string
  logs: string[]
  subscribers: Set<(line: string, type: "log" | "done" | "error") => void>
  cleanupTimer?: ReturnType<typeof setTimeout>
}

// Module-level registry, unchanged from the pre-migration implementation:
// conversion jobs are ephemeral, in-memory, and scoped to this server process.
const jobs = new Map<string, ConvertJob>()

function scheduleCleanup(id: string, job: ConvertJob) {
  job.cleanupTimer = setTimeout(() => {
    jobs.delete(id)
  }, 10 * 60 * 1000)
}

const encoder = new TextEncoder()

function sseFrame(eventType: string, data: string): Uint8Array {
  return encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify({ message: data })}\n\n`)
}

export const ConvertGroupLive = HttpApiBuilder.group(InkpipeApi, "convert", (handlers) =>
  handlers
    .handle("start", ({ payload }) =>
      Effect.gen(function* () {
        const file = payload.file
        const filename = basename(file.name || "unknown")
        const ext = filename.toLowerCase().split(".").pop()
        if (ext !== "cbz") {
          return yield* new ConvertError({ message: "Only .cbz files are accepted" })
        }

        const options = payload.options
        const overrides: Partial<KccConfig> | undefined =
          options && options.length > 0
            ? yield* Effect.try({
                try: (): unknown => JSON.parse(options),
                catch: (e) =>
                  new ConvertError({ message: `Invalid KCC options: ${e instanceof Error ? e.message : String(e)}` }),
              }).pipe(
                Effect.flatMap((parsed) =>
                  Schema.decodeUnknownEffect(KccConfigSchema)(parsed).pipe(
                    Effect.mapError((e) => new ConvertError({ message: `Invalid KCC options: ${e.message}` })),
                  ),
                ),
              )
            : undefined

        const id = randomUUID()
        const fileManager = yield* FileManagerService
        const tempBase = yield* fileManager.getTempBase
        const workDir = join(tempBase, `convert-${id}`)

        yield* Effect.promise(() => mkdir(workDir, { recursive: true }))

        const inputPath = join(workDir, filename)
        yield* Effect.promise(() => copyFile(file.path, inputPath))

        const job: ConvertJob = { status: "running", logs: [], subscribers: new Set() }
        jobs.set(id, job)

        const kcc = yield* KccService

        const onLog = (line: string) => {
          job.logs.push(line)
          for (const sub of job.subscribers) sub(line, "log")
        }

        // forkDetach inherits the current fiber's service context (KccService, etc.)
        yield* Effect.forkDetach(
          kcc.convert(inputPath, workDir, overrides, onLog).pipe(
            Effect.flatMap(() =>
              Effect.promise(() => readdir(workDir)).pipe(
                Effect.flatMap((files) => {
                  const epubFile = files.find((f) => f.toLowerCase().endsWith(".epub"))
                  if (!epubFile) {
                    job.status = "error"
                    job.error = "KCC did not produce an EPUB file"
                    for (const sub of job.subscribers) sub(job.error!, "error")
                    scheduleCleanup(id, job)
                    return Effect.promise(() =>
                      rm(workDir, { recursive: true, force: true }).catch(() => {}),
                    )
                  }
                  job.status = "done"
                  job.filename = epubFile
                  for (const sub of job.subscribers) sub(epubFile, "done")
                  scheduleCleanup(id, job)
                  return Effect.void
                }),
              ),
            ),
            Effect.catch((e: { message: string }) =>
              Effect.sync(() => {
                job.status = "error"
                job.error = e.message
                for (const sub of job.subscribers) sub(e.message, "error")
                scheduleCleanup(id, job)
              }),
            ),
          ),
        )

        return { id }
      }))
    .handleRaw("progress", ({ query }) =>
      Effect.sync(() => {
        const job = jobs.get(query.id)
        if (!job) {
          return HttpServerResponse.jsonUnsafe({ error: "Job not found" }, { status: 404 })
        }

        let activeSubscriber: ((line: string, type: "log" | "done" | "error") => void) | null = null
        let keepaliveTimer: ReturnType<typeof setInterval> | null = null

        const ping = encoder.encode(": ping\n\n")

        const readable = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const line of job.logs) {
              controller.enqueue(sseFrame("progress", line))
            }

            if (job.status === "done") {
              controller.enqueue(sseFrame("done", job.filename!))
              controller.close()
              return
            }
            if (job.status === "error") {
              controller.enqueue(sseFrame("error", job.error!))
              controller.close()
              return
            }

            keepaliveTimer = setInterval(() => {
              controller.enqueue(ping)
            }, 5000)

            activeSubscriber = (line, type) => {
              if (type === "log") {
                controller.enqueue(sseFrame("progress", line))
              } else {
                if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null }
                controller.enqueue(sseFrame(type, line))
                job.subscribers.delete(activeSubscriber!)
                activeSubscriber = null
                controller.close()
              }
            }
            job.subscribers.add(activeSubscriber)
          },
          cancel() {
            if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null }
            if (activeSubscriber) {
              job.subscribers.delete(activeSubscriber)
              activeSubscriber = null
            }
          },
        })

        const stream = Stream.fromReadableStream({
          evaluate: () => readable,
          onError: (cause) => cause,
        })

        return HttpServerResponse.stream(stream, {
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        })
      }))
    .handle("download", ({ query }) =>
      Effect.gen(function* () {
        const id = query.id
        const job = jobs.get(id)
        if (job && job.status !== "done") {
          return yield* new ConvertError({ message: "Conversion not yet complete" })
        }

        const fileManager = yield* FileManagerService
        const tempBase = yield* fileManager.getTempBase
        const workDir = join(tempBase, `convert-${id}`)

        const cleanup = Effect.promise(() => rm(workDir, { recursive: true, force: true }).catch(() => {}))

        return yield* Effect.gen(function* () {
          const files = yield* Effect.tryPromise({
            try: () => readdir(workDir),
            catch: () => new NotFoundError({ message: "Conversion not found" }),
          })
          const epubFile = files.find((f) => f.toLowerCase().endsWith(".epub"))

          if (!epubFile) {
            return yield* new NotFoundError({ message: "EPUB not found" })
          }

          const filePath = join(workDir, epubFile)
          const fileBuffer = yield* Effect.promise(() => readFile(filePath))

          if (job?.cleanupTimer) clearTimeout(job.cleanupTimer)
          jobs.delete(id)

          return HttpServerResponse.uint8Array(new Uint8Array(fileBuffer), {
            contentType: "application/epub+zip",
            headers: {
              "Content-Disposition": `attachment; filename="${encodeURIComponent(epubFile)}"`,
            },
          })
        }).pipe(Effect.ensuring(cleanup))
      })),
)
