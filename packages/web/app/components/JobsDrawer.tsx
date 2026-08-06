import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import JobCard from "./JobCard";
import { api } from "../hooks/useApiClient";
import type { Job } from "../lib/types";
import { ToastGroup } from "../ui/toast";

export function JobsDrawer() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const jobsQuery = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api.get("jobs").json<Job[]>(),
    refetchInterval: 3000,
  });

  const clearMutation = useMutation({
    mutationFn: () => api.delete("jobs"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      ToastGroup.create.success("Cleared completed jobs");
    },
    onError: (err) => {
      ToastGroup.create.error("Failed to clear jobs", err.message);
    },
  });

  const jobs = jobsQuery.data ?? [];
  if (jobs.length === 0) return null;

  const activeJobs = jobs.filter(
    (j) => j.stage !== "DONE" && j.stage !== "FAILED",
  );
  const completedJobs = jobs.filter(
    (j) => j.stage === "DONE" || j.stage === "FAILED",
  );

  return (
    <>
      <button
        type="button"
        aria-label="Toggle jobs"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface shadow-lg"
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-secondary">
          Jobs
        </span>
        {activeJobs.length > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-[2px] bg-accent font-mono text-on-accent text-[10px] font-bold min-w-[18px] h-[18px] px-1 leading-none rotate-3 shadow-sm">
            {activeJobs.length > 99 ? "99+" : activeJobs.length}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex max-h-[70vh] w-full flex-col overflow-y-auto rounded-t-2xl border-t border-border bg-surface px-4 pb-6 pt-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg italic text-primary">Jobs</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="text-lg text-secondary"
              >
                &times;
              </button>
            </div>

            {activeJobs.length > 0 && (
              <section className="mb-6">
                <h3 className="chapter-marker mb-3">
                  <span className="chapter-marker-label">
                    Active &middot; {activeJobs.length}
                  </span>
                </h3>
                <div className="island-shell rounded-2xl px-4">
                  {activeJobs.map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              </section>
            )}

            {completedJobs.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="chapter-marker flex-1">
                    <span className="chapter-marker-label">
                      Completed &middot; {completedJobs.length}
                    </span>
                  </h3>
                  <button
                    className="ml-3 px-3 py-1 text-sm border border-secondary rounded-[3px] hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
                    onClick={() => {
                      if (
                        confirm(
                          `Remove all ${completedJobs.length} completed jobs?`,
                        )
                      ) {
                        clearMutation.mutate();
                      }
                    }}
                  >
                    Clean
                  </button>
                </div>
                <div className="island-shell rounded-2xl px-4">
                  {completedJobs.map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </>
  );
}
