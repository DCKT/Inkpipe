import type { Job } from "../lib/types";
import { Progress } from "../ui/progress";

const STAGE_LABELS: Record<string, string> = {
  UPLOADING: "Uploading to AllDebrid",
  DEBRID_PROCESSING: "Debrid processing",
  DOWNLOADING: "Downloading",
  CONVERTING: "Converting to EPUB",
  UPLOADING_COPYPARTY: "Uploading to Copyparty",
  DONE: "Complete",
  FAILED: "Failed",
};

function formatElapsed(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function shortId(id: number): string {
  return `#${String(id).padStart(4, "0")}`;
}

export default function JobCard({ job }: { job: Job }) {
  const isDone = job.stage === "DONE";
  const isFailed = job.stage === "FAILED";
  const isActive = !isDone && !isFailed;

  // Only DONE/FAILED/in-progress exist on the Job stage enum today — there is
  // no distinct "queued/warning" state, so FAILED keeps the existing red
  // treatment instead of the spec's warning color rather than inventing one.
  const statusClass = isDone
    ? "text-success border-success/40"
    : isFailed
      ? "text-red-500 border-red-500/40"
      : "text-accent-hover border-accent/40";

  return (
    <div
      className={`flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:grid sm:grid-cols-[4.5rem_1fr_8rem_auto] sm:items-center sm:gap-4 ${
        isDone || isFailed ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 sm:contents">
        <span className="font-mono text-xs text-secondary">{shortId(job.id)}</span>
        <span className={`status-pill font-mono sm:order-4 ${statusClass}`}>
          {STAGE_LABELS[job.stage] ?? job.stage}
        </span>
      </div>

      <div className="min-w-0">
        <p className="break-words font-display text-sm text-primary">
          {job.title}
        </p>
        {isFailed && job.error && (
          <p className="mt-0.5 truncate text-xs text-red-500">{job.error}</p>
        )}
      </div>

      <div className="w-full sm:w-32">
        {isActive ? (
          <Progress.Root value={job.progress}>
            <Progress.Track>
              <Progress.Range />
            </Progress.Track>
          </Progress.Root>
        ) : (
          <span className="font-mono text-xs text-secondary">
            {formatElapsed(job.startedAt)}
          </span>
        )}
      </div>
    </div>
  );
}
