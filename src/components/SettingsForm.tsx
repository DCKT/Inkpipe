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
  const checkboxClass =
    'flex items-center gap-2.5 text-sm text-[var(--sea-ink)]'
  const subheadingClass = 'text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)] mt-4 mb-2'

  const setKcc = (patch: Partial<AppConfig['kcc']>) =>
    setForm({ ...form, kcc: { ...form.kcc, ...patch } })

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
          {/* Device & Format */}
          <p className={subheadingClass}>Device &amp; Format</p>
          <div>
            <label className={labelClass}>Docker Image</label>
            <input
              type="text"
              className={inputClass}
              placeholder="ghcr.io/ciromattia/kcc:latest"
              value={form.kcc.dockerImage}
              onChange={(e) => setKcc({ dockerImage: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Profile</label>
            <input
              type="text"
              className={inputClass}
              placeholder="KoBO"
              value={form.kcc.profile}
              onChange={(e) => setKcc({ profile: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Format</label>
            <select
              className={inputClass}
              value={form.kcc.format}
              onChange={(e) => setKcc({ format: e.target.value as AppConfig['kcc']['format'] })}
            >
              {['Auto', 'MOBI', 'EPUB', 'CBZ', 'KFX', 'PDF'].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Reading Mode */}
          <p className={subheadingClass}>Reading Mode</p>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.mangaStyle} onChange={(e) => setKcc({ mangaStyle: e.target.checked })} />
            Manga Style (right-to-left)
          </label>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.webtoon} onChange={(e) => setKcc({ webtoon: e.target.checked })} />
            Webtoon mode
          </label>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.twoPanel} onChange={(e) => setKcc({ twoPanel: e.target.checked })} />
            Two-panel mode
          </label>

          {/* Image Processing */}
          <p className={subheadingClass}>Image Processing</p>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.upscale} onChange={(e) => setKcc({ upscale: e.target.checked })} />
            Upscale
          </label>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.stretch} onChange={(e) => setKcc({ stretch: e.target.checked })} />
            Stretch
          </label>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.hq} onChange={(e) => setKcc({ hq: e.target.checked })} />
            High quality
          </label>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.forceColor} onChange={(e) => setKcc({ forceColor: e.target.checked })} />
            Force color
          </label>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.forcePng} onChange={(e) => setKcc({ forcePng: e.target.checked })} />
            Force PNG
          </label>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.noAutoContrast} onChange={(e) => setKcc({ noAutoContrast: e.target.checked })} />
            Disable auto contrast
          </label>
          <div>
            <label className={labelClass}>Gamma</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              className={inputClass}
              value={form.kcc.gamma}
              onChange={(e) => setKcc({ gamma: parseFloat(e.target.value) || 1.0 })}
            />
          </div>
          <div>
            <label className={labelClass}>Cropping</label>
            <select
              className={inputClass}
              value={form.kcc.cropping}
              onChange={(e) => setKcc({ cropping: e.target.value as '0' | '1' | '2' })}
            >
              <option value="0">Disabled</option>
              <option value="1">Standard</option>
              <option value="2">Aggressive</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Cropping Power</label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              className={inputClass}
              value={form.kcc.croppingPower}
              onChange={(e) => setKcc({ croppingPower: parseFloat(e.target.value) || 1.0 })}
            />
          </div>

          {/* Borders */}
          <p className={subheadingClass}>Borders</p>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.blackBorders} onChange={(e) => setKcc({ blackBorders: e.target.checked })} />
            Black borders
          </label>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.whiteBorders} onChange={(e) => setKcc({ whiteBorders: e.target.checked })} />
            White borders
          </label>

          {/* Advanced */}
          <p className={subheadingClass}>Advanced</p>
          <div>
            <label className={labelClass}>Splitter</label>
            <select
              className={inputClass}
              value={form.kcc.splitter}
              onChange={(e) => setKcc({ splitter: e.target.value as '0' | '1' | '2' })}
            >
              <option value="0">Disabled</option>
              <option value="1">Rotate</option>
              <option value="2">Split</option>
            </select>
          </div>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.noProcessing} onChange={(e) => setKcc({ noProcessing: e.target.checked })} />
            No processing
          </label>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.eraseRainbow} onChange={(e) => setKcc({ eraseRainbow: e.target.checked })} />
            Erase rainbow
          </label>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.coverFill} onChange={(e) => setKcc({ coverFill: e.target.checked })} />
            Cover fill
          </label>

          {/* Output */}
          <p className={subheadingClass}>Output</p>
          <div>
            <label className={labelClass}>Batch Split</label>
            <select
              className={inputClass}
              value={form.kcc.batchSplit}
              onChange={(e) => setKcc({ batchSplit: e.target.value as '0' | '1' | '2' })}
            >
              <option value="0">Disabled</option>
              <option value="1">Into chapters</option>
              <option value="2">Into volumes</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Target Size (KB, 0 = auto)</label>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={form.kcc.targetSize}
              onChange={(e) => setKcc({ targetSize: parseInt(e.target.value) || 0 })}
            />
          </div>

          {/* Device-specific */}
          <p className={subheadingClass}>Device-specific</p>
          <div>
            <label className={labelClass}>Custom Width (0 = auto)</label>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={form.kcc.customWidth}
              onChange={(e) => setKcc({ customWidth: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className={labelClass}>Custom Height (0 = auto)</label>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={form.kcc.customHeight}
              onChange={(e) => setKcc({ customHeight: parseInt(e.target.value) || 0 })}
            />
          </div>
          <label className={checkboxClass}>
            <input type="checkbox" checked={form.kcc.noKepub} onChange={(e) => setKcc({ noKepub: e.target.checked })} />
            Disable Kepub
          </label>
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
