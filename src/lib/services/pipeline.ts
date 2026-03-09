import { join } from "node:path";
import { loadConfig } from "../config";
import { createJob, updateJob } from "../jobs";
import {
  uploadMagnet,
  getMagnetStatus,
  getMagnetFiles,
  unlockLink,
  downloadFile,
  deleteMagnet,
} from "../api/alldebrid";
import { convertWithKcc } from "./kcc";
import { uploadToCopyparty } from "../api/copyparty";
import {
  ensureJobDir,
  cleanupJobDir,
  findFileByExtension,
  findAllFilesByExtension,
  extractRarArchive,
} from "./fileManager";
import type { ProwlarrResult } from "../api/prowlarr";

const POLL_INTERVAL = 3000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runPipeline(result: ProwlarrResult): Promise<void> {
  console.log("[pipeline] Starting pipeline for:", result.title);
  console.log("[pipeline] magnetUrl:", result.magnetUrl);
  console.log("[pipeline] downloadUrl:", result.downloadUrl);

  const config = await loadConfig();
  const magnetOrUrl = result.magnetUrl ?? result.downloadUrl;
  if (!magnetOrUrl) {
    console.error("[pipeline] No magnet or download URL for:", result.title);
    throw new Error(`No magnet or download URL for "${result.title}"`);
  }

  const job = createJob(result.title);
  console.log("[pipeline] Created job:", job.id, "for:", result.title);

  let magnetId: number | null = null;

  try {
    // Stage 1: Upload magnet to AllDebrid
    console.log(`[pipeline] [job ${job.id}] Stage: UPLOADING`);
    updateJob(job.id, { stage: "UPLOADING", progress: 0 });
    const upload = await uploadMagnet(magnetOrUrl, config);
    magnetId = upload.id;
    console.log(
      `[pipeline] [job ${job.id}] Magnet uploaded, id: ${upload.id}, ready: ${upload.ready}`,
    );

    // Stage 2: Wait until ready (skip polling if already ready at upload)
    if (!upload.ready) {
      console.log(`[pipeline] [job ${job.id}] Stage: DEBRID_PROCESSING`);
      updateJob(job.id, { stage: "DEBRID_PROCESSING", progress: 0 });
      let pollCount = 0;
      while (true) {
        pollCount++;
        const status = await getMagnetStatus(upload.id, config);
        if (status.ready) {
          console.log(
            `[pipeline] [job ${job.id}] Debrid ready after ${pollCount} polls`,
          );
          break;
        }
        if (status.statusCode >= 5) {
          throw new Error(
            `AllDebrid magnet error: ${status.status} (code ${status.statusCode})`,
          );
        }
        console.log(
          `[pipeline] [job ${job.id}] Debrid not ready (poll #${pollCount}, status: ${status.status}), waiting...`,
        );
        await sleep(POLL_INTERVAL);
      }
    } else {
      console.log(
        `[pipeline] [job ${job.id}] Already ready at upload, skipping poll`,
      );
    }

    // Stage 2b: Fetch file links via v4/magnet/files
    const debridFiles = await getMagnetFiles(upload.id, config);
    console.log(
      `[pipeline] [job ${job.id}] Got ${debridFiles.length} files from AllDebrid`,
    );

    if (debridFiles.length === 0) {
      throw new Error("No files returned from AllDebrid");
    }

    // Stage 3: Download files
    console.log(
      `[pipeline] [job ${job.id}] Stage: DOWNLOADING (${debridFiles.length} files)`,
    );
    updateJob(job.id, { stage: "DOWNLOADING", progress: 0 });
    const jobDir = await ensureJobDir(job.id, config);
    console.log(`[pipeline] [job ${job.id}] Job dir: ${jobDir}`);

    for (let i = 0; i < debridFiles.length; i++) {
      const file = debridFiles[i];
      console.log(
        `[pipeline] [job ${job.id}] Unlocking file ${i + 1}/${debridFiles.length}: ${file.filename}`,
      );
      const unlocked = await unlockLink(file.link, config);
      const destPath = join(jobDir, unlocked.filename);
      console.log(
        `[pipeline] [job ${job.id}] Downloading to: ${destPath} (${unlocked.size} bytes)`,
      );
      await downloadFile(unlocked.url, destPath, (received, total) => {
        if (total > 0) {
          updateJob(job.id, { progress: Math.round((received / total) * 100) });
        }
      });
    }

    // Stage 4: Convert to EPUB if needed
    const epubFile = await findFileByExtension(jobDir, [".epub"]);
    if (!epubFile) {
      console.log(`[pipeline] [job ${job.id}] Stage: CONVERTING`);
      updateJob(job.id, { stage: "CONVERTING", progress: 0 });
      const comicFiles = await findAllFilesByExtension(jobDir, [
        ".cbz",
        ".cbr",
        ".zip",
        ".rar",
        ".pdf",
      ]);
      if (comicFiles.length > 0) {
        for (const file of comicFiles) {
          let kccInput = file;
          if (
            file.toLowerCase().endsWith(".cbr") ||
            file.toLowerCase().endsWith(".rar")
          ) {
            console.log(
              `[pipeline] [job ${job.id}] Extracting RAR archive: ${file}`,
            );
            kccInput = await extractRarArchive(file);
          }
          console.log(`[pipeline] [job ${job.id}] Converting: ${kccInput}`);
          await convertWithKcc(kccInput, jobDir, config);
        }
        console.log(
          `[pipeline] [job ${job.id}] Conversion complete (${comicFiles.length} file(s))`,
        );
      } else {
        console.log(
          `[pipeline] [job ${job.id}] No convertible file found, skipping conversion`,
        );
      }
    } else {
      console.log(
        `[pipeline] [job ${job.id}] Already an EPUB, skipping conversion: ${epubFile}`,
      );
    }

    // Stage 5: Upload to Copyparty (if configured)
    if (config.copyparty.url) {
      console.log(`[pipeline] [job ${job.id}] Stage: UPLOADING_COPYPARTY`);
      updateJob(job.id, { stage: "UPLOADING_COPYPARTY", progress: 0 });

      // Find all final files to upload (prefer epubs, then cbz/cbr, then anything)
      let filesToUpload = await findAllFilesByExtension(jobDir, [".epub"]);
      if (filesToUpload.length === 0) {
        filesToUpload = await findAllFilesByExtension(jobDir, [".cbz", ".cbr"]);
      }
      if (filesToUpload.length === 0) {
        filesToUpload = await findAllFilesByExtension(jobDir, [
          ".zip",
          ".rar",
          ".pdf",
        ]);
      }

      if (filesToUpload.length > 0) {
        for (const file of filesToUpload) {
          console.log(
            `[pipeline] [job ${job.id}] Uploading to Copyparty: ${file}`,
          );
          await uploadToCopyparty(file, config);
        }
        console.log(
          `[pipeline] [job ${job.id}] Copyparty upload complete (${filesToUpload.length} file(s))`,
        );
      } else {
        console.log(
          `[pipeline] [job ${job.id}] No file found to upload to Copyparty`,
        );
      }
    } else {
      console.log(
        `[pipeline] [job ${job.id}] Copyparty not configured, skipping upload`,
      );
    }

    // Done
    console.log(`[pipeline] [job ${job.id}] Stage: DONE`);
    updateJob(job.id, { stage: "DONE", progress: 100 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] [job ${job.id}] FAILED:`, message);
    if (err instanceof Error && err.stack) {
      console.error(`[pipeline] [job ${job.id}] Stack:`, err.stack);
    }
    updateJob(job.id, {
      stage: "FAILED",
      error: message,
    });
  } finally {
    // Cleanup: remove temp files and AllDebrid magnet regardless of outcome
    console.log(`[pipeline] [job ${job.id}] Cleaning up`);
    await cleanupJobDir(job.id, config);
    if (magnetId !== null) {
      await deleteMagnet(magnetId, config);
    }
  }
}
