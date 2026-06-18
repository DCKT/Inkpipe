import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import JobCard from "../components/JobCard";
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
      <h1 className="display-title mb-6 text-3xl font-bold text-[var(--sea-ink)]">
        Jobs
      </h1>

      {jobs.length === 0 && (
        <div className="island-shell rounded-2xl p-8 text-center text-sm text-[var(--sea-ink-soft)]">
          No jobs yet. Start a download from the Search page.
        </div>
      )}

      {activeJobs.length > 0 && (
        <section className="mb-8">
          <h2 className="island-kicker inline-block px-2 py-1 mb-3">
            Active ({activeJobs.length})
          </h2>
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {completedJobs.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="island-kicker inline-block px-2 py-1">
              Completed ({completedJobs.length})
            </h2>
            <button
              className="px-3 py-1 text-sm border border-[var(--sea-ink-soft)] rounded-lg hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
              onClick={() => {
                if (confirm(`Remove all ${completedJobs.length} completed jobs?`)) {
                  clearMutation.mutate();
                }
              }}
            >
              Clean
            </button>
          </div>
          <div className="space-y-3">
            {completedJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
