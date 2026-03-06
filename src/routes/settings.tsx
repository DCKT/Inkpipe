import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import SettingsForm from '../components/SettingsForm'
import { getSettingsFn, updateSettingsFn } from '../server/functions/settings'
import type { AppConfig } from '../lib/config'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function SettingsPage() {
  const queryClient = useQueryClient()

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
