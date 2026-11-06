// Test-only fixtures for Anna's Archive books.
import { type AnnasArchiveResult, AnnasArchiveResultSchema } from "@inkpipe/shared"
import { Option, Schema } from "effect"

const decodeBook = Schema.decodeUnknownOption(AnnasArchiveResultSchema)

export const makeBook = (
  overrides: Partial<Record<keyof AnnasArchiveResult, unknown>> = {},
): AnnasArchiveResult =>
  Option.getOrThrowWith(
    decodeBook({
      md5: "aaa111",
      title: "Dune",
      author: "Frank Herbert",
      extension: "epub",
      size: "1.2MB",
      language: "en",
      coverUrl: "https://img.test/dune.jpg",
      ...overrides,
    }),
    () => new globalThis.Error("invalid book fixture"),
  )
