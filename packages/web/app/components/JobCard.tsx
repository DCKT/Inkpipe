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

export default function JobCard({ job }: { job: Job }) {
  const isDone = job.stage === "DONE";
  const isFailed = job.stage === "FAILED";

  return (
    <div className="island-shell rounded-2xl p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="truncate text-sm font-semibold text-primary">
          {job.title}
        </h3>
        <span className="ml-2 shrink-0 text-xs text-secondary">
          {formatElapsed(job.startedAt)}
        </span>
      </div>

      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isDone
              ? "bg-success/15 text-success"
              : isFailed
                ? "bg-red-100 text-red-700"
                : "bg-[rgba(136,57,239,0.14)] text-accent-hover"
          }`}
        >
          {STAGE_LABELS[job.stage] ?? job.stage}
        </span>
      </div>

      {!isDone && !isFailed && (
        <Progress.Root value={job.progress}>
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>
      )}

      {isFailed && job.error && (
        <p className="mt-2 text-xs text-red-600">{job.error}</p>
      )}
    </div>
  );
}
