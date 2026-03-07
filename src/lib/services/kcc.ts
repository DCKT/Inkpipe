import { spawn } from "node:child_process";
import { basename, relative } from "node:path";
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

    const args = [
      "run",
      "--rm",
      "-v",
      volumeMount,
      config.kcc.dockerImage,
      "--profile",
      config.kcc.profile,
      containerInput,
      "--forcecolor",
      "--upscale",
      "--title",
      inputFilename,
      "--cropping",
      "1",
      "--eraserainbow",
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
