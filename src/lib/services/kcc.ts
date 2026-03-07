import { spawn } from "node:child_process";
import { basename, parse, relative } from "node:path";
import type { AppConfig } from "../config";
import { getTempBase } from "./fileManager";

export function convertWithKcc(
  inputPath: string,
  outputDir: string,
  config: AppConfig,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const inputFilename = basename(inputPath);

    let volumeMount: string;
    let containerInput: string;
    let containerOutput: string;

    if (config.tempVolume) {
      // Docker-in-Docker: mount the shared named volume
      const relPath = relative(getTempBase(config), outputDir);
      volumeMount = `${config.tempVolume}:/data`;
      containerInput = `/data/${relPath}/${inputFilename}`;
      containerOutput = `/data/${relPath}`;
    } else {
      // Host mode: bind-mount the output directory directly
      volumeMount = `${outputDir}:/data`;
      containerInput = `/data/${inputFilename}`;
      containerOutput = "/data";
    }

    const kcc = config.kcc;
    const kccArgs: string[] = [
      "--profile", kcc.profile,
      "--cropping", kcc.cropping,
      "--title", parse(inputFilename).name,
    ];

    // Boolean flags
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
      if (enabled) kccArgs.push(flag);
    }

    // Conditional value options
    if (kcc.format !== "Auto") kccArgs.push("--format", kcc.format);
    if (kcc.gamma !== 1.0) kccArgs.push("--gamma", String(kcc.gamma));
    if (kcc.croppingPower !== 1.0) kccArgs.push("--croppingpower", String(kcc.croppingPower));
    if (kcc.splitter !== "0") kccArgs.push("--splitter", kcc.splitter);
    if (kcc.batchSplit !== "0") kccArgs.push("--batchsplit", kcc.batchSplit);
    if (kcc.targetSize > 0) kccArgs.push("--targetsize", String(kcc.targetSize));
    if (kcc.customWidth > 0) kccArgs.push("--customwidth", String(kcc.customWidth));
    if (kcc.customHeight > 0) kccArgs.push("--customheight", String(kcc.customHeight));

    const args = [
      "run",
      "--rm",
      "-v",
      volumeMount,
      kcc.dockerImage,
      ...kccArgs,
      containerInput,
      "-o",
      containerOutput,
    ];

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
        reject(new Error(`KCC Docker exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start Docker for KCC: ${err.message}`));
    });
  });
}
