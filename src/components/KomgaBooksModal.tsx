import { useQuery } from '@tanstack/react-query'
import { X, BookOpen, Hash, Calendar } from 'lucide-react'
import type { KomgaSeries } from '../lib/api/komga'
import { getKomgaBooksForSeriesFn } from '../server/functions/komga'

interface KomgaBooksModalProps {
  series: KomgaSeries
  onClose: () => void
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

export default function KomgaBooksModal({ series, onClose }: KomgaBooksModalProps) {
  const booksQuery = useQuery({
    queryKey: ['komga-books', series.id],
    queryFn: () => getKomgaBooksForSeriesFn({ data: { seriesId: series.id } }),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="island-shell flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--line)] p-5">
          <div>
            <h2 className="text-lg font-bold text-[var(--sea-ink)]">
              {series.metadata.title || series.name}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--sea-ink-soft)]">
              {series.booksCount} {series.booksCount === 1 ? 'book' : 'books'} · {series.metadata.status}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-lg p-1.5 text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--sea-ink)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5">
          {booksQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-[var(--sea-ink-soft)]">
              Loading books...
            </div>
          )}

          {booksQuery.isError && (
            <div className="rounded-xl border border-red-200 p-4 text-sm text-red-600">
              {booksQuery.error.message}
            </div>
          )}

          {booksQuery.data && booksQuery.data.length === 0 && (
            <div className="py-12 text-center text-sm text-[var(--sea-ink-soft)]">
              No books found.
            </div>
          )}

          {booksQuery.data && booksQuery.data.length > 0 && (
            <div className="space-y-2">
              {booksQuery.data.map((book) => (
                <div
                  key={book.id}
                  className="flex items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(79,184,178,0.12)] text-[var(--lagoon)]">
                    <BookOpen size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--sea-ink)]">
                      {book.metadata.title || book.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-[var(--sea-ink-soft)]">
                      {book.metadata.number && (
                        <span className="flex items-center gap-1">
                          <Hash size={11} />
                          {book.metadata.number}
                        </span>
                      )}
                      {book.media?.pagesCount > 0 && (
                        <span>{book.media.pagesCount} pages</span>
                      )}
                      {book.size && (
                        <span>{book.size}</span>
                      )}
                      {book.created && (
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {formatDate(book.created)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
