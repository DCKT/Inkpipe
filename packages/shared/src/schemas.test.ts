import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import {
  AppConfigSchema,
  JobSchema,
  KccConfigSchema,
  ProwlarrResultSchema,
} from "./schemas";

describe("AppConfigSchema", () => {
  it("decodes empty object to defaults", () => {
    const config = Schema.decodeUnknownSync(AppConfigSchema)({});
    expect(config.prowlarr).toEqual({ url: "", apiKey: "" });
    expect(config.alldebrid).toEqual({ apiKey: "" });
    expect(config.copyparty).toEqual({ url: "", uploadPath: "/", password: "" });
    expect(config.komga).toEqual({
      url: "",
      apiKey: "",
      defaultLibraryId: "",
    });
  });

  it("has KCC defaults nested correctly", () => {
    const config = Schema.decodeUnknownSync(AppConfigSchema)({});
    expect(config.kcc).toBeDefined();
  });
});

describe("ProwlarrResultSchema", () => {
  it("validates a valid object", () => {
    const valid = {
      title: "One Piece",
      guid: "guid-123",
      magnetUrl: "magnet:?xt=urn:btih:abc",
      downloadUrl: null,
      size: 123456,
      seeders: 5,
      indexer: "Nyaa",
      categories: ["Books", "Manga"],
      publishDate: "2024-01-15T00:00:00Z",
    };
    const result = Schema.decodeUnknownSync(ProwlarrResultSchema)(valid);
    expect(result.title).toBe("One Piece");
    expect(result.guid).toBe("guid-123");
    expect(result.magnetUrl).toBe("magnet:?xt=urn:btih:abc");
    expect(result.downloadUrl).toBeNull();
    expect(result.size).toBe(123456);
    expect(result.seeders).toBe(5);
    expect(result.indexer).toBe("Nyaa");
    expect(result.categories).toEqual(["Books", "Manga"]);
    expect(result.publishDate).toBe("2024-01-15T00:00:00Z");
  });

  it("accepts null for URL fields", () => {
    const result = Schema.decodeUnknownSync(ProwlarrResultSchema)({
      title: "Test",
      guid: "g",
      magnetUrl: null,
      downloadUrl: null,
      size: 0,
      seeders: 0,
      indexer: "idx",
      categories: [],
      publishDate: null,
    });
    expect(result.magnetUrl).toBeNull();
    expect(result.downloadUrl).toBeNull();
  });
});

describe("JobSchema", () => {
  it("validates all fields", () => {
    const job = {
      id: "abc-123",
      title: "One Piece v01.cbz",
      stage: "DOWNLOADING" as const,
      progress: 42,
      error: undefined,
      startedAt: 1700000000000,
    };
    const result = Schema.decodeUnknownSync(JobSchema)(job);
    expect(result.id).toBe("abc-123");
    expect(result.title).toBe("One Piece v01.cbz");
    expect(result.stage).toBe("DOWNLOADING");
    expect(result.progress).toBe(42);
    expect(result.startedAt).toBe(1700000000000);
  });

  it("validates all stage values", () => {
    const stages = [
      "UPLOADING",
      "DEBRID_PROCESSING",
      "DOWNLOADING",
      "CONVERTING",
      "UPLOADING_COPYPARTY",
      "DONE",
      "FAILED",
    ] as const;
    for (const stage of stages) {
      const result = Schema.decodeUnknownSync(JobSchema)({
        id: "id",
        title: "title",
        stage,
        progress: 0,
        startedAt: 0,
      });
      expect(result.stage).toBe(stage);
    }
  });
});

describe("KccConfigSchema", () => {
  it("verifies defaults are correct", () => {
    const kcc = Schema.decodeUnknownSync(KccConfigSchema)({});
    expect(kcc.dockerImage).toBe("ghcr.io/ciromattia/kcc:latest");
    expect(kcc.profile).toBe("KoBO");
    expect(kcc.format).toBe("Auto");
    expect(kcc.mangaStyle).toBe(false);
    expect(kcc.webtoon).toBe(false);
    expect(kcc.twoPanel).toBe(false);
    expect(kcc.upscale).toBe(true);
    expect(kcc.stretch).toBe(false);
    expect(kcc.hq).toBe(false);
    expect(kcc.gamma).toBe(1.0);
    expect(kcc.cropping).toBe("1");
    expect(kcc.croppingPower).toBe(1.0);
    expect(kcc.forceColor).toBe(true);
    expect(kcc.forcePng).toBe(false);
    expect(kcc.noAutoContrast).toBe(false);
    expect(kcc.blackBorders).toBe(false);
    expect(kcc.whiteBorders).toBe(false);
    expect(kcc.splitter).toBe("0");
    expect(kcc.noProcessing).toBe(false);
    expect(kcc.eraseRainbow).toBe(true);
    expect(kcc.coverFill).toBe(false);
    expect(kcc.batchSplit).toBe("0");
    expect(kcc.targetSize).toBe(0);
    expect(kcc.customWidth).toBe(0);
    expect(kcc.customHeight).toBe(0);
    expect(kcc.noKepub).toBe(false);
  });

  it("allows overriding defaults", () => {
    const kcc = Schema.decodeUnknownSync(KccConfigSchema)({
      profile: "Kindle",
      format: "MOBI",
      upscale: false,
    });
    expect(kcc.profile).toBe("Kindle");
    expect(kcc.format).toBe("MOBI");
    expect(kcc.upscale).toBe(false);
    // other defaults remain
    expect(kcc.dockerImage).toBe("ghcr.io/ciromattia/kcc:latest");
    expect(kcc.stretch).toBe(false);
  });
});
