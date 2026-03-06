import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import JobCard from '../components/JobCard'
import { getJobsFn } from '../server/functions/jobs'

export const Route = createFileRoute('/jobs')({ component: JobsPage })

function JobsPage() {
  const jobsQuery = useQuery({
    queryKey: ['jobs'],
    queryFn: () => getJobsFn(),
    refetchInterval: 3000,
  })

  const jobs = jobsQuery.data ?? []
  const activeJobs = jobs.filter((j) => j.stage !== 'DONE' && j.stage !== 'FAILED')
  const completedJobs = jobs.filter((j) => j.stage === 'DONE' || j.stage === 'FAILED')

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
          <h2 className="island-kicker mb-3">Active ({activeJobs.length})</h2>
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {completedJobs.length > 0 && (
        <section>
          <h2 className="island-kicker mb-3">Completed ({completedJobs.length})</h2>
          <div className="space-y-3">
            {completedJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
