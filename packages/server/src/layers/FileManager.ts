import { Effect, Layer } from "effect"
import { readdir, mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, parse } from "node:path"
import { spawn } from "node:child_process"
import { FileManagerError } from "@inkpipe/shared"

export class FileManagerService extends Effect.Tag("FileManagerService")<
  FileManagerService,
  {
    readonly getTempBase: Effect.Effect<string>
    readonly isRunningInDocker: Effect.Effect<boolean>
    readonly ensureJobDir: (jobId: string) => Effect.Effect<string, FileManagerError>
    readonly cleanupJobDir: (jobId: string) => Effect.Effect<void, FileManagerError>
    readonly findFileByExtension: (dir: string, extensions: string[]) => Effect.Effect<string | null, FileManagerError>
    readonly findAllFilesByExtension: (dir: string, extensions: string[]) => Effect.Effect<string[], FileManagerError>
    readonly extractRarArchive: (filePath: string) => Effect.Effect<string, FileManagerError>
  }
>() {}

const DOCKER_TEMP_DIR = "/tmp/inkpipe"

export const FileManagerServiceLive = Layer.effect(
  FileManagerService,
  Effect.gen(function* () {
    const getTempBase = Effect.sync(
      () =>
        existsSync("/.dockerenv")
          ? DOCKER_TEMP_DIR
          : join(tmpdir(), "inkpipe"),
    )

    const isRunningInDocker = Effect.sync(() => existsSync("/.dockerenv"))

    const ensureJobDir = (jobId: string) =>
      Effect.gen(function* () {
        const base = yield* getTempBase
        return yield* Effect.tryPromise({
          try: async () => {
            const dir = join(base, jobId)
            await mkdir(dir, { recursive: true })
            return dir
          },
          catch: (e) =>
            new FileManagerError({
              message: `Failed to create job dir: ${e instanceof Error ? e.message : String(e)}`,
            }),
        })
      })

    const cleanupJobDir = (jobId: string) =>
      Effect.gen(function* () {
        const base = yield* getTempBase
        yield* Effect.tryPromise({
          try: async () => {
            const dir = join(base, jobId)
            await rm(dir, { recursive: true, force: true })
          },
          catch: (e) =>
            new FileManagerError({
              message: `Failed to clean up job dir: ${e instanceof Error ? e.message : String(e)}`,
            }),
        })
      })

    const findFileByExtension = (dir: string, extensions: string[]) =>
      Effect.tryPromise({
        try: async () => {
          const files = await readdir(dir)
          const match = files.find((f) =>
            extensions.some((ext) => f.toLowerCase().endsWith(ext)),
          )
          return match ? join(dir, match) : null
        },
        catch: (e) =>
          new FileManagerError({
            message: `Failed to find file: ${e instanceof Error ? e.message : String(e)}`,
          }),
      })

    const findAllFilesByExtension = (dir: string, extensions: string[]) =>
      Effect.tryPromise({
        try: async () => {
          const files = await readdir(dir)
          return files
            .filter((f) => extensions.some((ext) => f.toLowerCase().endsWith(ext)))
            .map((f) => join(dir, f))
        },
        catch: (e) =>
          new FileManagerError({
            message: `Failed to find files: ${e instanceof Error ? e.message : String(e)}`,
          }),
      })

    const extractRarArchive = (filePath: string) =>
      Effect.gen(function* () {
        const { name, dir: fileDir } = parse(filePath)
        const extractDir = join(fileDir, name)
        yield* Effect.tryPromise({
          try: async () => {
            await mkdir(extractDir, { recursive: true })
          },
          catch: (e) =>
            new FileManagerError({
              message: `Failed to create extract dir: ${e instanceof Error ? e.message : String(e)}`,
            }),
        })

        return yield* Effect.tryPromise({
          try: () =>
            new Promise<string>((resolve, reject) => {
              const proc = spawn("unrar", ["x", "-o+", filePath, extractDir])
              let stderr = ""
              proc.stderr.on("data", (data: Buffer) => {
                stderr += data.toString()
              })
              proc.on("close", (code: number) => {
                if (code === 0) {
                  resolve(extractDir)
                } else {
                  reject(
                    new Error(`unrar exited with code ${code}: ${stderr}`),
                  )
                }
              })
              proc.on("error", (err: Error) => {
                reject(new Error(`Failed to start unrar: ${err.message}`))
              })
            }),
          catch: (e) =>
            new FileManagerError({
              message: `${e instanceof Error ? e.message : String(e)}`,
            }),
        })
      })

    return {
      getTempBase,
      isRunningInDocker,
      ensureJobDir,
      cleanupJobDir,
      findFileByExtension,
      findAllFilesByExtension,
      extractRarArchive,
    }
  }),
)
