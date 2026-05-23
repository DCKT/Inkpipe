import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import SettingsForm from '../components/SettingsForm'
import { getSettingsFn, updateSettingsFn } from '../server/functions/settings'
import type { AppConfig } from '../lib/config'

export const Route = createFileRoute('/settings')({
  validateSearch: z.object({ komgaNotConfigured: z.boolean().optional() }),
  component: SettingsPage,
})

function SettingsPage() {
  const queryClient = useQueryClient()
  const { komgaNotConfigured } = Route.useSearch()

  const configQuery = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettingsFn(),
  })

  const saveMutation = useMutation({
    mutationFn: (config: AppConfig) => updateSettingsFn({ data: config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <h1 className="display-title mb-6 text-3xl font-bold text-[var(--sea-ink)]">
        Settings
      </h1>

      {komgaNotConfigured && (
        <div className="island-shell mb-6 rounded-2xl border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Komga is not configured yet. Please enter your Komga URL and API key below.
        </div>
      )}

      {configQuery.isLoading && (
        <p className="text-sm text-[var(--sea-ink-soft)]">Loading settings...</p>
      )}

      {configQuery.isError && (
        <div className="island-shell mb-6 rounded-2xl border-red-200 p-4 text-sm text-red-600">
          Failed to load settings: {configQuery.error.message}
        </div>
      )}

      {configQuery.data && (
        <>
          <SettingsForm
            config={configQuery.data}
            onSave={(config) => saveMutation.mutate(config)}
            isSaving={saveMutation.isPending}
          />
          {saveMutation.isSuccess && (
            <p className="mt-4 text-center text-sm text-[var(--palm)]">
              Settings saved successfully.
            </p>
          )}
          {saveMutation.isError && (
            <p className="mt-4 text-center text-sm text-red-600">
              Failed to save: {saveMutation.error.message}
            </p>
          )}
        </>
      )}
    </main>
  )
}
