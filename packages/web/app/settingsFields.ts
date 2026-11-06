import type { AppConfig } from "@inkpipe/shared"
import { Schema } from "effect"

// Every plain-text setting outside the KCC form. Dotted names are the stable
// handle a Message carries; the tables below turn them into typed reads/writes.

export const SettingsTextField = Schema.Literals([
  "prowlarr.url",
  "prowlarr.apiKey",
  "annasArchive.baseUrl",
  "annasArchive.apiKey",
  "alldebrid.apiKey",
  "copyparty.url",
  "copyparty.uploadPath",
  "copyparty.password",
  "komga.url",
  "komga.apiKey",
  "komga.defaultLibraryId",
  "general.publicUrl",
  "telegram.botToken",
  "telegram.chatId",
])
export type SettingsTextField = typeof SettingsTextField.Type

export const readSettingsText: Record<SettingsTextField, (config: AppConfig) => string> = {
  "prowlarr.url": (c) => c.prowlarr.url,
  "prowlarr.apiKey": (c) => c.prowlarr.apiKey,
  "annasArchive.baseUrl": (c) => c.annasArchive.baseUrl,
  "annasArchive.apiKey": (c) => c.annasArchive.apiKey,
  "alldebrid.apiKey": (c) => c.alldebrid.apiKey,
  "copyparty.url": (c) => c.copyparty.url,
  "copyparty.uploadPath": (c) => c.copyparty.uploadPath,
  "copyparty.password": (c) => c.copyparty.password,
  "komga.url": (c) => c.komga.url,
  "komga.apiKey": (c) => c.komga.apiKey,
  "komga.defaultLibraryId": (c) => c.komga.defaultLibraryId,
  "general.publicUrl": (c) => c.general.publicUrl,
  "telegram.botToken": (c) => c.telegram.botToken,
  "telegram.chatId": (c) => c.telegram.chatId,
}

export const writeSettingsText: Record<
  SettingsTextField,
  (config: AppConfig, value: string) => AppConfig
> = {
  "prowlarr.url": (c, url) => ({ ...c, prowlarr: { ...c.prowlarr, url } }),
  "prowlarr.apiKey": (c, apiKey) => ({ ...c, prowlarr: { ...c.prowlarr, apiKey } }),
  "annasArchive.baseUrl": (c, baseUrl) => ({ ...c, annasArchive: { ...c.annasArchive, baseUrl } }),
  "annasArchive.apiKey": (c, apiKey) => ({ ...c, annasArchive: { ...c.annasArchive, apiKey } }),
  "alldebrid.apiKey": (c, apiKey) => ({ ...c, alldebrid: { ...c.alldebrid, apiKey } }),
  "copyparty.url": (c, url) => ({ ...c, copyparty: { ...c.copyparty, url } }),
  "copyparty.uploadPath": (c, uploadPath) => ({ ...c, copyparty: { ...c.copyparty, uploadPath } }),
  "copyparty.password": (c, password) => ({ ...c, copyparty: { ...c.copyparty, password } }),
  "komga.url": (c, url) => ({ ...c, komga: { ...c.komga, url } }),
  "komga.apiKey": (c, apiKey) => ({ ...c, komga: { ...c.komga, apiKey } }),
  "komga.defaultLibraryId": (c, defaultLibraryId) => ({
    ...c,
    komga: { ...c.komga, defaultLibraryId },
  }),
  "general.publicUrl": (c, publicUrl) => ({ ...c, general: { ...c.general, publicUrl } }),
  "telegram.botToken": (c, botToken) => ({ ...c, telegram: { ...c.telegram, botToken } }),
  "telegram.chatId": (c, chatId) => ({ ...c, telegram: { ...c.telegram, chatId } }),
}

/** Komga's library list can only load once both credentials are saved. */
export const hasKomgaCredentials = (config: AppConfig): boolean =>
  config.komga.url !== "" && config.komga.apiKey !== ""
