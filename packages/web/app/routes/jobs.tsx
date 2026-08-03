import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import JobCard from "../components/JobCard";
import { PageHeader } from "../components/PageHeader";
import { api } from "../hooks/useApiClient";
import type { Job } from "../lib/types";
import { ToastGroup } from "../ui/toast";

export default function JobsPage() {
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
  const activeJobs = jobs.filter(
    (j) => j.stage !== "DONE" && j.stage !== "FAILED",
  );
  const completedJobs = jobs.filter(
    (j) => j.stage === "DONE" || j.stage === "FAILED",
  );

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <PageHeader
        numeral="IV"
        label="Jobs"
        title="Queue"
        meta={jobs.length > 0 ? `${activeJobs.length} active` : undefined}
      />

      {jobs.length === 0 && (
        <div className="blank-page flex flex-col items-center gap-3 p-8 text-center">
          <div className="blank-page-icon" />
          <p className="font-display text-lg italic text-primary">No jobs yet</p>
          <p className="text-sm text-secondary">Start a download from the Search page.</p>
        </div>
      )}

      {activeJobs.length > 0 && (
        <section className="mb-8">
          <h2 className="chapter-marker mb-3">
            <span className="chapter-marker-label">
              Active &middot; {activeJobs.length}
            </span>
          </h2>
          <div className="island-shell rounded-2xl px-4">
            {activeJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {completedJobs.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="chapter-marker flex-1">
              <span className="chapter-marker-label">
                Completed &middot; {completedJobs.length}
              </span>
            </h2>
            <button
              className="ml-3 px-3 py-1 text-sm border border-secondary rounded-[3px] hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
              onClick={() => {
                if (confirm(`Remove all ${completedJobs.length} completed jobs?`)) {
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
    </main>
  );
}
