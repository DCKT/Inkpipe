import { Effect, Layer } from "effect"
import { spawn } from "node:child_process"
import { basename, parse, relative } from "node:path"
import type { AppConfig } from "@inkpipe/shared"
import { KccError } from "@inkpipe/shared"
import { ConfigService } from "./Config"
import { FileManagerService } from "./FileManager"

export class KccService extends Effect.Tag("KccService")<
  KccService,
  {
    readonly convert: (inputPath: string, outputDir: string) => Effect.Effect<string, KccError>
  }
>() {}

const KCC_CONTAINER_NAME = "inkpipe-kcc"
const KCC_DATA_DIR = "/data"

export function buildKccArgs(inputFilename: string, config: AppConfig): string[] {
  const kcc = config.kcc
  const args: string[] = [
    "--profile", kcc.profile,
    "--cropping", kcc.cropping,
    "--title", parse(inputFilename).name,
    "--author", "",
  ]

  const booleanFlags: [boolean, string][] = [
    [kcc.mangaStyle, "--manga-style"],
    [kcc.webtoon, "--webtoon"],
    [kcc.twoPanel, "--two-panel"],
    [kcc.upscale, "--upscale"],
    [kcc.stretch, "--stretch"],
    [kcc.hq, "--hq"],
    [kcc.forceColor, "--forcecolor"],
    [kcc.forcePng, "--forcepng"],
    [kcc.noAutoContrast, "--noautocontrast"],
    [kcc.blackBorders, "--blackborders"],
    [kcc.whiteBorders, "--whiteborders"],
    [kcc.noProcessing, "--noprocessing"],
    [kcc.eraseRainbow, "--eraserainbow"],
    [kcc.coverFill, "--coverfill"],
    [kcc.noKepub, "--nokepub"],
  ]
  for (const [enabled, flag] of booleanFlags) {
    if (enabled) args.push(flag)
  }

  if (kcc.format !== "Auto") args.push("--format", kcc.format)
  if (kcc.gamma !== 1.0) args.push("--gamma", String(kcc.gamma))
  if (kcc.croppingPower !== 1.0) args.push("--croppingpower", String(kcc.croppingPower))
  if (kcc.splitter !== "0") args.push("--splitter", kcc.splitter)
  if (kcc.batchSplit !== "0") args.push("--batchsplit", kcc.batchSplit)
  if (kcc.targetSize > 0) args.push("--targetsize", String(kcc.targetSize))
  if (kcc.customWidth > 0) args.push("--customwidth", String(kcc.customWidth))
  if (kcc.customHeight > 0) args.push("--customheight", String(kcc.customHeight))

  return args
}

let kccQueue: Promise<void> = Promise.resolve()

function enqueueKcc(fn: () => Promise<string>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    kccQueue = kccQueue
      .catch(() => {})
      .then(() => fn())
      .then(resolve, reject)
  })
}

export const KccServiceLive = Layer.effect(
  KccService,
  Effect.gen(function* () {
    const configService = yield* ConfigService
    const fileManager = yield* FileManagerService

    const convert = (inputPath: string, outputDir: string) =>
      Effect.gen(function* () {
        const config = yield* configService.loadConfig.pipe(
          Effect.catchAll((e) => Effect.fail(new KccError({ message: e.message }))),
        )
        const inputFilename = basename(inputPath)
        const kccArgs = buildKccArgs(inputFilename, config)
        const isDocker = yield* fileManager.isRunningInDocker

        return yield* Effect.tryPromise({
          try: () =>
            enqueueKcc(() =>
              new Promise<string>((resolve, reject) => {
                let args: string[]
                if (isDocker) {
                  const tempBase = "/tmp/inkpipe"
                  const relPath = relative(tempBase, outputDir)
                  const containerInput = `${KCC_DATA_DIR}/${relPath}/${inputFilename}`
                  const containerOutput = `${KCC_DATA_DIR}/${relPath}`
                  args = [
                    "exec", KCC_CONTAINER_NAME,
                    "c2e",
                    ...kccArgs,
                    containerInput,
                    "-o", containerOutput,
                  ]
                } else {
                  args = [
                    "run", "--rm",
                    "-v", `${outputDir}:/data`,
                    config.kcc.dockerImage,
                    ...kccArgs,
                    `/data/${inputFilename}`,
                    "-o", "/data",
                  ]
                }

                console.log(`[kcc] Starting conversion: ${inputFilename}`)
                console.log(`[kcc] Docker args: docker ${args.join(" ")}`)

                const proc = spawn("docker", args)

                let stdout = ""
                let stderr = ""

                proc.stdout.on("data", (data: Buffer) => {
                  stdout += data.toString()
                  console.log(`[kcc] stdout: ${data.toString().trim()}`)
                })

                proc.stderr.on("data", (data: Buffer) => {
                  stderr += data.toString()
                  console.log(`[kcc] stderr: ${data.toString().trim()}`)
                })

                proc.on("close", (code: number) => {
                  console.log(`[kcc] Process exited with code ${code}`)
                  if (code === 0) {
                    console.log(`[kcc] Conversion succeeded for: ${inputFilename}`)
                    resolve(stdout)
                  } else {
                    console.error(`[kcc] Conversion failed for: ${inputFilename}`)
                    console.error(`[kcc] stderr: ${stderr}`)
                    reject(new Error(`KCC exited with code ${code}: ${stderr}`))
                  }
                })

                proc.on("error", (err: Error) => {
                  console.error(`[kcc] Failed to start KCC: ${err.message}`)
                  reject(new Error(`Failed to start KCC: ${err.message}`))
                })
              }),
            ),
          catch: (e) => {
            const message = e instanceof Error ? e.message : String(e)
            return new KccError({ message })
          },
        })
      })

    return { convert }
  }),
)
