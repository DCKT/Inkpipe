import { spawn } from "node:child_process";
import { basename, parse, relative } from "node:path";
import type { AppConfig } from "../config";
import { getTempBase, isRunningInDocker } from "./fileManager";

const KCC_CONTAINER_NAME = "inkpipe-kcc";
const KCC_DATA_DIR = "/data";

function buildKccArgs(inputFilename: string, config: AppConfig): string[] {
  const kcc = config.kcc;
  const args: string[] = [
    "--profile", kcc.profile,
    "--cropping", kcc.cropping,
    "--title", parse(inputFilename).name,
    "--author", "",
  ];

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
  ];
  for (const [enabled, flag] of booleanFlags) {
    if (enabled) args.push(flag);
  }

  if (kcc.format !== "Auto") args.push("--format", kcc.format);
  if (kcc.gamma !== 1.0) args.push("--gamma", String(kcc.gamma));
  if (kcc.croppingPower !== 1.0) args.push("--croppingpower", String(kcc.croppingPower));
  if (kcc.splitter !== "0") args.push("--splitter", kcc.splitter);
  if (kcc.batchSplit !== "0") args.push("--batchsplit", kcc.batchSplit);
  if (kcc.targetSize > 0) args.push("--targetsize", String(kcc.targetSize));
  if (kcc.customWidth > 0) args.push("--customwidth", String(kcc.customWidth));
  if (kcc.customHeight > 0) args.push("--customheight", String(kcc.customHeight));

  return args;
}

export function convertWithKcc(
  inputPath: string,
  outputDir: string,
  config: AppConfig,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const inputFilename = basename(inputPath);
    const kccArgs = buildKccArgs(inputFilename, config);

    let args: string[];

    if (isRunningInDocker()) {
      // Compose mode: exec into the KCC sidecar container (shared volume)
      const relPath = relative(getTempBase(), outputDir);
      const containerInput = `${KCC_DATA_DIR}/${relPath}/${inputFilename}`;
      const containerOutput = `${KCC_DATA_DIR}/${relPath}`;
      args = [
        "exec", KCC_CONTAINER_NAME,
        "c2e",
        ...kccArgs,
        containerInput,
        "-o", containerOutput,
      ];
    } else {
      // Host mode: docker run with bind-mount
      args = [
        "run", "--rm",
        "-v", `${outputDir}:/data`,
        config.kcc.dockerImage,
        ...kccArgs,
        `/data/${inputFilename}`,
        "-o", "/data",
      ];
    }

    const proc = spawn("docker", args);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`KCC exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start KCC: ${err.message}`));
    });
  });
}
