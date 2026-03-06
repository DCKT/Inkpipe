import { useState } from 'react'
import type { AppConfig } from '../lib/config'

interface SettingsFormProps {
  config: AppConfig
  onSave: (config: AppConfig) => void
  isSaving: boolean
}

export default function SettingsForm({ config, onSave, isSaving }: SettingsFormProps) {
  const [form, setForm] = useState<AppConfig>(config)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(form)
  }

  const inputClass =
    'w-full rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2.5 text-sm text-[var(--sea-ink)] placeholder:text-[var(--sea-ink-soft)] focus:border-[var(--lagoon)] focus:outline-none'
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="island-shell rounded-2xl p-6">
        <legend className="island-kicker mb-3 px-1">Prowlarr</legend>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>URL</label>
            <input
              type="url"
              className={inputClass}
              placeholder="http://localhost:9696"
              value={form.prowlarr.url}
              onChange={(e) =>
                setForm({ ...form, prowlarr: { ...form.prowlarr, url: e.target.value } })
              }
            />
          </div>
          <div>
            <label className={labelClass}>API Key</label>
            <input
              type="password"
              className={inputClass}
              placeholder="Your Prowlarr API key"
              value={form.prowlarr.apiKey}
              onChange={(e) =>
                setForm({ ...form, prowlarr: { ...form.prowlarr, apiKey: e.target.value } })
              }
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="island-shell rounded-2xl p-6">
        <legend className="island-kicker mb-3 px-1">AllDebrid</legend>
        <div>
          <label className={labelClass}>API Key</label>
          <input
            type="password"
            className={inputClass}
            placeholder="Your AllDebrid API key"
            value={form.alldebrid.apiKey}
            onChange={(e) =>
              setForm({ ...form, alldebrid: { ...form.alldebrid, apiKey: e.target.value } })
            }
          />
        </div>
      </fieldset>

      <fieldset className="island-shell rounded-2xl p-6">
        <legend className="island-kicker mb-3 px-1">KCC</legend>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Docker Image</label>
            <input
              type="text"
              className={inputClass}
              placeholder="ghcr.io/ciromattia/kcc:latest"
              value={form.kcc.dockerImage}
              onChange={(e) =>
                setForm({ ...form, kcc: { ...form.kcc, dockerImage: e.target.value } })
              }
            />
          </div>
          <div>
            <label className={labelClass}>Profile</label>
            <input
              type="text"
              className={inputClass}
              placeholder="KoBO"
              value={form.kcc.profile}
              onChange={(e) =>
                setForm({ ...form, kcc: { ...form.kcc, profile: e.target.value } })
              }
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="island-shell rounded-2xl p-6">
        <legend className="island-kicker mb-3 px-1">Copyparty</legend>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>URL</label>
            <input
              type="url"
              className={inputClass}
              placeholder="http://localhost:3923"
              value={form.copyparty.url}
              onChange={(e) =>
                setForm({ ...form, copyparty: { ...form.copyparty, url: e.target.value } })
              }
            />
          </div>
          <div>
            <label className={labelClass}>Upload Path</label>
            <input
              type="text"
              className={inputClass}
              placeholder="/"
              value={form.copyparty.uploadPath}
              onChange={(e) =>
                setForm({ ...form, copyparty: { ...form.copyparty, uploadPath: e.target.value } })
              }
            />
          </div>
          <div>
            <label className={labelClass}>Password (leave empty if none)</label>
            <input
              type="password"
              className={inputClass}
              placeholder="Password"
              value={form.copyparty.password}
              onChange={(e) =>
                setForm({ ...form, copyparty: { ...form.copyparty, password: e.target.value } })
              }
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="island-shell rounded-2xl p-6">
        <legend className="island-kicker mb-3 px-1">Storage</legend>
        <div>
          <label className={labelClass}>Temp Directory (leave empty for system default)</label>
          <input
            type="text"
            className={inputClass}
            placeholder="/tmp/inkpipe"
            value={form.tempDir}
            onChange={(e) => setForm({ ...form, tempDir: e.target.value })}
          />
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={isSaving}
        className="w-full rounded-xl border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-6 py-3 text-sm font-semibold text-[var(--lagoon-deep)] transition hover:-translate-y-0.5 hover:bg-[rgba(79,184,178,0.24)] disabled:opacity-50"
      >
        {isSaving ? 'Saving...' : 'Save Settings'}
      </button>
    </form>
  )
}
