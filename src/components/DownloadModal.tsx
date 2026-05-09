import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCopypartyFoldersFn } from '../server/functions/copyparty'
import type { ProwlarrResult } from '../lib/api/prowlarr'

interface DownloadModalProps {
  items: ProwlarrResult[]
  onConfirm: (items: ProwlarrResult[], subfolder?: string) => void
  onClose: () => void
}

export default function DownloadModal({ items, onConfirm, onClose }: DownloadModalProps) {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const foldersQuery = useQuery({
    queryKey: ['copyparty-folders'],
    queryFn: () => getCopypartyFoldersFn(),
    staleTime: 30_000,
  })

  const folders = foldersQuery.data ?? []

  const filtered = inputValue
    ? folders.filter((f) => f.toLowerCase().includes(inputValue.toLowerCase()))
    : folders

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleConfirm = () => {
    const subfolder = inputValue.trim() || undefined
    onConfirm(items, subfolder)
    onClose()
  }

  const handleSelect = (name: string) => {
    setInputValue(name)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={containerRef}
        className="island-shell w-full max-w-md rounded-2xl p-6 shadow-2xl flex flex-col gap-5"
      >
        <h2 className="text-lg font-semibold text-[var(--sea-ink)]">
          Download {items.length} item{items.length !== 1 ? 's' : ''}
        </h2>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-[var(--sea-ink)]">
            Subfolder{' '}
            <span className="font-normal text-[var(--sea-ink)]/60">(optional)</span>
          </label>

          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="e.g. manga/action or leave empty"
              className="w-full rounded-lg border border-[rgba(50,143,151,0.3)] bg-white/60 px-3 py-2 text-sm text-[var(--sea-ink)] placeholder-[var(--sea-ink)]/40 outline-none focus:border-[var(--lagoon)] focus:ring-1 focus:ring-[var(--lagoon)]"
            />

            {showSuggestions && filtered.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[rgba(50,143,151,0.2)] bg-white shadow-lg">
                {filtered.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleSelect(name)
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-[var(--sea-ink)] hover:bg-[var(--lagoon)]/10"
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {foldersQuery.isLoading && (
            <p className="text-xs text-[var(--sea-ink)]/50">Loading existing folders…</p>
          )}
          {!foldersQuery.isLoading && folders.length === 0 && (
            <p className="text-xs text-[var(--sea-ink)]/50">
              No existing subfolders found — type a new name to create one.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[rgba(50,143,151,0.3)] px-5 py-2 text-sm font-medium text-[var(--sea-ink)] transition hover:bg-[var(--lagoon)]/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-full bg-[var(--lagoon)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--lagoon-deep)]"
          >
            {inputValue.trim() ? `Download to /${inputValue.trim()}` : 'Download'}
          </button>
        </div>
      </div>
    </div>
  )
}
