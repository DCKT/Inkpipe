// Test-only fixtures for Komga data.
import { type KomgaBook, type KomgaSeries } from "@inkpipe/shared"

export const makeSeries = (overrides: Partial<KomgaSeries> = {}): KomgaSeries => ({
  id: "s1",
  name: "dir-berserk-folder",
  booksCount: 41,
  metadata: { status: "ONGOING", title: "Berserk" },
  ...overrides,
})

export const makeBook = (overrides: Partial<KomgaBook> = {}): KomgaBook => ({
  id: "b1",
  name: "berserk-v01.cbz",
  number: 1,
  created: "2026-01-15T10:00:00Z",
  size: "50.0 MiB",
  media: { pagesCount: 224, mediaType: "application/zip" },
  metadata: { title: "Volume 1", number: "1" },
  ...overrides,
})
