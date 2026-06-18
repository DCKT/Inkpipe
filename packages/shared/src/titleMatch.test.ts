import { describe, expect, it } from "vitest";
import { cleanTitle, findBestMatch, trigramScore } from "./titleMatch";

describe("cleanTitle", () => {
  it("strips [bracketed] group tags", () => {
    expect(cleanTitle("[NoGroup] One Piece 113")).toBe("One Piece 113");
    expect(cleanTitle("[NoGroup] [Rip] One Piece 113")).toBe(
      "One Piece 113",
    );
  });

  it("strips (parentheses) content", () => {
    expect(cleanTitle("One Piece (2024)")).toBe("One Piece");
    expect(cleanTitle("Series (Digital) (2023)")).toBe("Series");
  });

  it("strips volume/chapter markers", () => {
    expect(cleanTitle("One Piece v01")).toBe("One Piece");
    expect(cleanTitle("One Piece Vol. 1")).toBe("One Piece");
    expect(cleanTitle("One Piece Volume 12")).toBe("One Piece");
    expect(cleanTitle("One Piece Ch. 001")).toBe("One Piece");
    expect(cleanTitle("One Piece Chapter 5")).toBe("One Piece");
  });

  it("strips resolution markers", () => {
    expect(cleanTitle("One Piece 1080p")).toBe("One Piece");
    expect(cleanTitle("One Piece 720p")).toBe("One Piece");
  });

  it("strips file extensions", () => {
    expect(cleanTitle("One Piece.cbz")).toBe("One Piece");
    expect(cleanTitle("One Piece.cbr")).toBe("One Piece");
    expect(cleanTitle("One Piece.epub")).toBe("One Piece");
    expect(cleanTitle("One Piece.pdf")).toBe("One Piece");
  });

  it("normalizes extra whitespace", () => {
    expect(cleanTitle("One    Piece")).toBe("One Piece");
    expect(cleanTitle("  One Piece  ")).toBe("One Piece");
  });

  it("replaces dashes and underscores with spaces", () => {
    expect(cleanTitle("One-Piece_v2")).toBe("One Piece v2");
  });

  it("handles complex real-world titles", () => {
    expect(
      cleanTitle("[NoGroup] One Piece (2024) Vol. 1 Ch. 001 1080p.cbz"),
    ).toBe("One Piece");
    expect(
      cleanTitle("[Acme] Series Name - Volume 3 Chapter 7 720p (Digital).epub"),
    ).toBe("Series Name");
  });
});

describe("trigramScore", () => {
  it("returns 1 for identical strings", () => {
    expect(trigramScore("hello", "hello")).toBe(1);
    expect(trigramScore("One Piece", "One Piece")).toBe(1);
  });

  it("returns near 0 for completely different strings", () => {
    expect(trigramScore("abc", "xyz")).toBe(0);
    expect(trigramScore("apple", "stone")).toBeLessThan(0.1);
  });

  it("returns high score for similar strings", () => {
    expect(trigramScore("One Piece", "One Piece")).toBe(1);
    expect(trigramScore("One Piece", "One Piece v2")).toBeGreaterThan(0.5);
    expect(trigramScore("Attack on Titan", "Attack on Titan")).toBe(1);
  });

  it("returns low score for dissimilar strings", () => {
    expect(trigramScore("One Piece", "Naruto")).toBeLessThan(0.3);
  });

  it("is case-insensitive", () => {
    expect(trigramScore("ONE PIECE", "one piece")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(trigramScore("", "")).toBe(1);
    expect(trigramScore("hello", "")).toBe(0);
    expect(trigramScore("", "hello")).toBe(0);
  });
});

describe("findBestMatch", () => {
  const seriesList = [
    {
      id: "1",
      name: "One Piece",
      booksCount: 107,
      metadata: { title: "One Piece" },
    },
    {
      id: "2",
      name: "Naruto",
      booksCount: 72,
      metadata: { title: "Naruto" },
    },
    {
      id: "3",
      name: "Attack on Titan",
      booksCount: 34,
      metadata: { title: "Attack on Titan" },
    },
  ];

  it("finds the best match above threshold", () => {
    const result = findBestMatch("One Piece", seriesList);
    expect(result).not.toBeNull();
    expect(result!.seriesId).toBe("1");
    expect(result!.seriesName).toBe("One Piece");
    expect(result!.booksCount).toBe(107);
    expect(result!.score).toBeGreaterThanOrEqual(0.4);
  });

  it("finds match even with noisy raw title", () => {
    const result = findBestMatch(
      "[NoGroup] Naruto (2024) Vol. 12 Ch. 34 1080p.cbz",
      seriesList,
    );
    expect(result).not.toBeNull();
    expect(result!.seriesId).toBe("2");
  });

  it("returns null when all scores are below threshold", () => {
    const result = findBestMatch("xyz123", seriesList, 0.9);
    expect(result).toBeNull();
  });

  it("returns null for empty series list", () => {
    const result = findBestMatch("One Piece", [], 0.4);
    expect(result).toBeNull();
  });

  it("uses custom threshold", () => {
    const result = findBestMatch(
      "[NoGroup] Attack on Titan.cbz",
      seriesList,
      0.9,
    );
    expect(result).not.toBeNull();
    expect(result!.seriesId).toBe("3");
  });
});
