import { useQuery } from "@tanstack/react-query";
import { BookOpen, Hash, Calendar } from "lucide-react";
import type { KomgaSeries, KomgaBook } from "../lib/types";
import { api } from "../hooks/useApiClient";
import { Dialog } from "../ui/dialog";

interface KomgaBooksModalProps {
  series: KomgaSeries;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function KomgaBooksModal({ series, onClose }: KomgaBooksModalProps) {
  const booksQuery = useQuery({
    queryKey: ["komga-books", series.id],
    queryFn: () => api.post("komga/books", { json: { seriesId: series.id } }).json<KomgaBook[]>(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Dialog.Root open onOpenChange={(details: { open: boolean }) => { if (!details.open) onClose(); }}>
      <Dialog.Backdrop />
      <Dialog.Content className="flex max-h-[80vh] w-full max-w-2xl flex-col">
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <Dialog.Title>
              {series.metadata.title || series.name}
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-xs">
              {series.booksCount} {series.booksCount === 1 ? "book" : "books"} · {series.metadata.status}
            </Dialog.Description>
          </div>
          <Dialog.CloseTrigger />
        </div>

        <div className="overflow-y-auto p-5">
          {booksQuery.isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-secondary">
              Loading books...
            </div>
          )}

          {booksQuery.isError && (
            <div className="rounded-xl border border-red-200 p-4 text-sm text-red-600">
              {booksQuery.error.message}
            </div>
          )}

          {booksQuery.data && booksQuery.data.length === 0 && (
            <div className="py-12 text-center text-sm text-secondary">
              No books found.
            </div>
          )}

          {booksQuery.data && booksQuery.data.length > 0 && (
            <div className="space-y-2">
              {booksQuery.data.map((book) => (
                <div
                  key={book.id}
                  className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(136,57,239,0.12)] text-accent">
                    <BookOpen size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-primary">
                      {book.metadata.title || book.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-secondary">
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
      </Dialog.Content>
    </Dialog.Root>
  );
}
