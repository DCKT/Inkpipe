import { AppConfigSchema } from "@inkpipe/shared"
import { Option, Schema } from "effect"
import { describe, expect, test } from "vitest"

import {
  SettingsTextField,
  hasKomgaCredentials,
  readSettingsText,
  writeSettingsText,
} from "./settingsFields"

const defaults = Option.getOrThrowWith(
  Schema.decodeUnknownOption(AppConfigSchema)({}),
  () => new globalThis.Error("defaults must decode"),
)

describe("settings text fields", () => {
  test.each(SettingsTextField.literals)(
    "%s: a write is read back and touches nothing else",
    (field) => {
      const written = writeSettingsText[field](defaults, "VALUE")
      expect(readSettingsText[field](written)).toBe("VALUE")

      const others = SettingsTextField.literals.filter((other) => other !== field)
      for (const other of others) {
        expect(readSettingsText[other](written)).toBe(readSettingsText[other](defaults))
      }
      expect(written.kcc).toStrictEqual(defaults.kcc)
    },
  )
})

describe("hasKomgaCredentials", () => {
  test("needs both the URL and the API key", () => {
    const withUrl = writeSettingsText["komga.url"](defaults, "https://komga")
    const withKey = writeSettingsText["komga.apiKey"](defaults, "k")
    const both = writeSettingsText["komga.apiKey"](withUrl, "k")
    expect(hasKomgaCredentials(defaults)).toBe(false)
    expect(hasKomgaCredentials(withUrl)).toBe(false)
    expect(hasKomgaCredentials(withKey)).toBe(false)
    expect(hasKomgaCredentials(both)).toBe(true)
  })
})
