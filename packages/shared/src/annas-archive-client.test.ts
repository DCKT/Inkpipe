import { describe, expect, it } from "vitest";
import { sortAnnasArchiveResults } from "./annas-archive-client";
import type { AnnasArchiveResult } from "./schemas";

function makeResult(md5: string, language: string | null): AnnasArchiveResult {
  return {
    md5,
    title: md5,
    author: null,
    extension: "epub",
    size: "1MB",
    language,
    coverUrl: null,
  };
}

describe("sortAnnasArchiveResults", () => {
  it("moves French results to the front", () => {
    const results = [
      makeResult("en1", "English [en]"),
      makeResult("fr1", "French [fr]"),
      makeResult("ja1", "Japanese [ja]"),
    ];

    const sorted = sortAnnasArchiveResults(results);

    expect(sorted.map((r) => r.md5)).toEqual(["fr1", "en1", "ja1"]);
  });

  it("preserves relative order within each group (stable sort)", () => {
    const results = [
      makeResult("en1", "English [en]"),
      makeResult("fr1", "French [fr]"),
      makeResult("en2", "English [en]"),
      makeResult("fr2", "French [fr]"),
    ];

    const sorted = sortAnnasArchiveResults(results);

    expect(sorted.map((r) => r.md5)).toEqual(["fr1", "fr2", "en1", "en2"]);
  });

  it("treats null language as non-preferred", () => {
    const results = [
      makeResult("null1", null),
      makeResult("fr1", "French [fr]"),
    ];

    const sorted = sortAnnasArchiveResults(results);

    expect(sorted.map((r) => r.md5)).toEqual(["fr1", "null1"]);
  });

  it("does not mutate the input array", () => {
    const results = [
      makeResult("en1", "English [en]"),
      makeResult("fr1", "French [fr]"),
    ];
    const original = [...results];

    sortAnnasArchiveResults(results);

    expect(results).toEqual(original);
  });

  it("supports a custom preferred language", () => {
    const results = [
      makeResult("en1", "English [en]"),
      makeResult("ja1", "Japanese [ja]"),
    ];

    const sorted = sortAnnasArchiveResults(results, "ja");

    expect(sorted.map((r) => r.md5)).toEqual(["ja1", "en1"]);
  });

  it("is case-insensitive on the language code", () => {
    const results = [
      makeResult("en1", "English [EN]"),
      makeResult("fr1", "French [FR]"),
    ];

    const sorted = sortAnnasArchiveResults(results);

    expect(sorted.map((r) => r.md5)).toEqual(["fr1", "en1"]);
  });
});
