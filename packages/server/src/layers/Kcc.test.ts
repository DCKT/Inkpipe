import { describe, it, expect } from "vitest"
import type { AppConfig } from "@inkpipe/shared"
import { buildKccArgs } from "./Kcc"

function makeDefaultKccConfig(overrides: Partial<AppConfig["kcc"]> = {}): AppConfig["kcc"] {
  return {
    dockerImage: "ghcr.io/ciromattia/kcc:latest",
    profile: "KoBO",
    format: "Auto",
    mangaStyle: false,
    webtoon: false,
    twoPanel: false,
    upscale: true,
    stretch: false,
    hq: false,
    gamma: 1.0,
    cropping: "1",
    croppingPower: 1.0,
    forceColor: true,
    forcePng: false,
    noAutoContrast: false,
    blackBorders: false,
    whiteBorders: false,
    splitter: "0",
    noProcessing: false,
    eraseRainbow: true,
    coverFill: false,
    batchSplit: "0",
    targetSize: 0,
    customWidth: 0,
    customHeight: 0,
    noKepub: false,
    ...overrides,
  }
}

function makeConfig(kccOverrides: Partial<AppConfig["kcc"]> = {}): AppConfig {
  return {
    prowlarr: { url: "", apiKey: "" },
    alldebrid: { apiKey: "" },
    kcc: makeDefaultKccConfig(kccOverrides),
    copyparty: { url: "", uploadPath: "/", password: "" },
    komga: { url: "", apiKey: "", defaultLibraryId: "" },
  }
}

describe("buildKccArgs", () => {
  it("always includes profile, cropping, title, author", () => {
    const args = buildKccArgs("comic.cbz", makeConfig())

    expect(args).toContain("--profile")
    expect(args).toContain("KoBO")
    expect(args).toContain("--cropping")
    expect(args).toContain("1")
    expect(args).toContain("--title")
    expect(args).toContain("comic")
    expect(args).toContain("--author")
    expect(args).toContain("")
  })

  it("parses filename for title (removes extension)", () => {
    const args = buildKccArgs("Naruto_T01.cbz", makeConfig())

    const titleIdx = args.indexOf("--title")
    expect(args[titleIdx + 1]).toBe("Naruto_T01")
  })

  describe("boolean flags", () => {
    it("includes --upscale when enabled (default)", () => {
      const args = buildKccArgs("comic.cbz", makeConfig())
      expect(args).toContain("--upscale")
    })

    it("excludes --upscale when disabled", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ upscale: false }))
      expect(args).not.toContain("--upscale")
    })

    it("includes --forcecolor when enabled (default)", () => {
      const args = buildKccArgs("comic.cbz", makeConfig())
      expect(args).toContain("--forcecolor")
    })

    it("excludes --forcecolor when disabled", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ forceColor: false }))
      expect(args).not.toContain("--forcecolor")
    })

    it("includes --eraserainbow when enabled (default)", () => {
      const args = buildKccArgs("comic.cbz", makeConfig())
      expect(args).toContain("--eraserainbow")
    })

    it("excludes --eraserainbow when disabled", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ eraseRainbow: false }))
      expect(args).not.toContain("--eraserainbow")
    })

    it("excludes all disabled boolean flags", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({
        upscale: false,
        forceColor: false,
        eraseRainbow: false,
      }))
      expect(args).not.toContain("--upscale")
      expect(args).not.toContain("--forcecolor")
      expect(args).not.toContain("--eraserainbow")
    })

    it("includes --manga-style when enabled", () => {
      const args = buildKccArgs("manga.cbz", makeConfig({ mangaStyle: true }))
      expect(args).toContain("--manga-style")
    })

    it("includes --webtoon when enabled", () => {
      const args = buildKccArgs("webtoon.cbz", makeConfig({ webtoon: true }))
      expect(args).toContain("--webtoon")
    })

    it("includes --stretch when enabled", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ stretch: true }))
      expect(args).toContain("--stretch")
    })

    it("includes --hq when enabled", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ hq: true }))
      expect(args).toContain("--hq")
    })

    it("includes --nokepub when enabled", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ noKepub: true }))
      expect(args).toContain("--nokepub")
    })
  })

  describe("conditional value flags", () => {
    it("includes --format when not Auto", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ format: "MOBI" }))
      expect(args).toContain("--format")
      expect(args).toContain("MOBI")
    })

    it("excludes --format when Auto (default)", () => {
      const args = buildKccArgs("comic.cbz", makeConfig())
      expect(args).not.toContain("--format")
    })

    it("includes --gamma when not 1.0", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ gamma: 1.5 }))
      expect(args).toContain("--gamma")
      expect(args).toContain("1.5")
    })

    it("excludes --gamma when 1.0 (default)", () => {
      const args = buildKccArgs("comic.cbz", makeConfig())
      expect(args).not.toContain("--gamma")
    })

    it("includes --croppingpower when not 1.0", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ croppingPower: 0.8 }))
      expect(args).toContain("--croppingpower")
      expect(args).toContain("0.8")
    })

    it("includes --splitter when not 0", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ splitter: "1" }))
      expect(args).toContain("--splitter")
      expect(args).toContain("1")
    })

    it("includes --batchsplit when not 0", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ batchSplit: "1" }))
      expect(args).toContain("--batchsplit")
      expect(args).toContain("1")
    })

    it("includes --targetsize when > 0", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ targetSize: 100 }))
      expect(args).toContain("--targetsize")
      expect(args).toContain("100")
    })

    it("includes --customwidth when > 0", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ customWidth: 1920 }))
      expect(args).toContain("--customwidth")
      expect(args).toContain("1920")
    })

    it("includes --customheight when > 0", () => {
      const args = buildKccArgs("comic.cbz", makeConfig({ customHeight: 1080 }))
      expect(args).toContain("--customheight")
      expect(args).toContain("1080")
    })

    it("excludes zero-value numeric flags", () => {
      const args = buildKccArgs("comic.cbz", makeConfig())
      expect(args).not.toContain("--targetsize")
      expect(args).not.toContain("--customwidth")
      expect(args).not.toContain("--customheight")
    })
  })

  describe("all flags disabled + non-default values", () => {
    it("returns minimal args when everything is off", () => {
      const args = buildKccArgs("book.cbz", makeConfig({
        format: "EPUB",
        gamma: 1.5,
        croppingPower: 0.9,
        splitter: "2",
        batchSplit: "1",
        targetSize: 50,
        customWidth: 1000,
        customHeight: 1500,
        upscale: false,
        forceColor: false,
        eraseRainbow: false,
        mangaStyle: true,
        noKepub: true,
      }))

      // Always present
      expect(args).toContain("--profile")
      expect(args).toContain("--cropping")
      expect(args).toContain("--title")
      expect(args).toContain("--author")
      // Enabled boolean
      expect(args).toContain("--manga-style")
      expect(args).toContain("--nokepub")
      // Disabled boolean
      expect(args).not.toContain("--upscale")
      expect(args).not.toContain("--forcecolor")
      expect(args).not.toContain("--eraserainbow")
      // Conditional
      expect(args).toContain("--format")
      expect(args).toContain("EPUB")
      expect(args).toContain("--gamma")
      expect(args).toContain("1.5")
      expect(args).toContain("--croppingpower")
      expect(args).toContain("0.9")
    })
  })
})
