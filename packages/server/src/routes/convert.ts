import { Effect } from "effect"
import { writeFile, readdir, mkdir, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { KccService } from "../layers/Kcc"
import { FileManagerService } from "../layers/FileManager"

type ConvertJob = {
  status: "running" | "done" | "error"
  filename?: string
  error?: string
  logs: string[]
  subscribers: Set<(line: string, type: "log" | "done" | "error") => void>
  cleanupTimer?: ReturnType<typeof setTimeout>
}

const jobs = new Map<string, ConvertJob>()

function scheduleCleanup(id: string, job: ConvertJob) {
  job.cleanupTimer = setTimeout(() => {
    jobs.delete(id)
  }, 10 * 60 * 1000)
}

export const convertStartHandler = (formData: FormData) =>
  Effect.gen(function* () {
    const file = formData.get("file")
    if (!file || !(file instanceof Blob)) {
      return yield* Effect.fail(new Error("No file provided"))
    }

    const filename = file.name || "unknown"
    const ext = filename.toLowerCase().split(".").pop()
    if (ext !== "cbz") {
      return yield* Effect.fail(new Error("Only .cbz files are accepted"))
    }

    const id = randomUUID()
    const fileManager = yield* FileManagerService
    const tempBase = yield* fileManager.getTempBase
    const workDir = join(tempBase, `convert-${id}`)

    yield* Effect.promise(() => mkdir(workDir, { recursive: true }))

    const inputPath = join(workDir, filename)
    const arrayBuffer = yield* Effect.promise(() => file.arrayBuffer())
    yield* Effect.promise(() => writeFile(inputPath, Buffer.from(arrayBuffer)))

    const job: ConvertJob = { status: "running", logs: [], subscribers: new Set() }
    jobs.set(id, job)

    const kcc = yield* KccService

    const onLog = (line: string) => {
      job.logs.push(line)
      for (const sub of job.subscribers) sub(line, "log")
    }

    // forkDaemon inherits the current fiber's service context (KccService, etc.)
    yield* Effect.forkDaemon(
      kcc.convert(inputPath, workDir, onLog).pipe(
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
        Effect.catchAll((e: { message: string }) =>
          Effect.sync(() => {
            job.status = "error"
            job.error = e.message
            for (const sub of job.subscribers) sub(e.message, "error")
            scheduleCleanup(id, job)
          }),
        ),
      ),
    )

    return Response.json({ id })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 400 }),
      ),
    ),
  )

const encoder = new TextEncoder()

function sseFrame(eventType: string, data: string): Uint8Array {
  return encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify({ message: data })}\n\n`)
}

export const convertProgressHandler = (id: string): Response => {
  const job = jobs.get(id)
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 })
  }

  let activeSubscriber: ((line: string, type: "log" | "done" | "error") => void) | null = null
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null

  const ping = encoder.encode(": ping\n\n")

  const stream = new ReadableStream({
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

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}

export const convertDownloadHandler = (id: string) =>
  Effect.gen(function* () {
    const job = jobs.get(id)
    if (job && job.status !== "done") {
      return yield* Effect.fail(new Error("Conversion not yet complete"))
    }

    const fileManager = yield* FileManagerService
    const tempBase = yield* fileManager.getTempBase
    const workDir = join(tempBase, `convert-${id}`)

    const files = yield* Effect.promise(() =>
      readdir(workDir).catch(() => {
        throw new Error("Conversion not found")
      }),
    )
    const epubFile = files.find((f) => f.toLowerCase().endsWith(".epub"))

    if (!epubFile) {
      yield* Effect.promise(() =>
        rm(workDir, { recursive: true, force: true }).catch(() => {}),
      )
      return yield* Effect.fail(new Error("EPUB not found"))
    }

    const filePath = join(workDir, epubFile)
    const fileBuffer = yield* Effect.promise(() => readFile(filePath))

    yield* Effect.promise(() =>
      rm(workDir, { recursive: true, force: true }).catch(() => {}),
    )

    if (job?.cleanupTimer) clearTimeout(job.cleanupTimer)
    jobs.delete(id)

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(epubFile)}"`,
        "Content-Length": String(fileBuffer.byteLength),
      },
    })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 404 }),
      ),
    ),
  )
