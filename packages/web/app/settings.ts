import {
  type AppConfig,
  AppConfigSchema,
  type KomgaLibrary,
  KomgaLibrarySchema,
} from "@inkpipe/shared"
import { Effect, Option, Schema } from "effect"
import { AsyncData, Command, File, Submodel, type Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, callApi } from "./api"
import { downloadJson } from "./download"
import { buttonClass, fieldsetCard, selectField, textField } from "./form"
import * as Kcc from "./kccOptions"
import { pageHeader } from "./pageHeader"
import {
  SettingsTextField,
  hasKomgaCredentials,
  readSettingsText,
  writeSettingsText,
} from "./settingsFields"
import { ToastRequest, toast } from "./toast"

export const EXPORT_FILE_NAME = "inkpipe-settings.json"

// MODEL

const Form = Schema.Struct({
  /** Last config the server confirmed (decides whether Komga libraries can load). */
  saved: AppConfigSchema,
  draft: AppConfigSchema,
  kcc: Kcc.Model,
})
type Form = typeof Form.Type

const FormData = AsyncData.Schema(Form, Schema.String)
const LibrariesData = AsyncData.Schema(Schema.Array(KomgaLibrarySchema), Schema.String)

export const Model = Schema.Struct({
  form: FormData.schema,
  libraries: LibrariesData.schema,
  /** Came from `/settings?komgaNotConfigured=true`. */
  isKomgaNotConfigured: Schema.Boolean,
  isSaving: Schema.Boolean,
  isTestingTelegram: Schema.Boolean,
  isTransferring: Schema.Boolean,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  SucceededFetchSettings: { config: AppConfigSchema },
  FailedFetchSettings: { reason: Schema.String },
  SucceededFetchLibraries: { libraries: Schema.Array(KomgaLibrarySchema) },
  FailedFetchLibraries: { reason: Schema.String },
  ChangedText: { field: SettingsTextField, value: Schema.String },
  GotKccMessage: { message: Kcc.Message },
  ClickedSave: {},
  SucceededSaveSettings: { config: AppConfigSchema },
  FailedSaveSettings: { reason: Schema.String },
  ClickedTestTelegram: {},
  SucceededTestTelegram: {},
  FailedTestTelegram: { reason: Schema.String },
  ClickedExport: {},
  SucceededExportSettings: {},
  FailedExportSettings: { reason: Schema.String },
  ClickedImport: {},
  CancelledImportSettings: {},
  SucceededImportSettings: {},
  FailedImportSettings: { reason: Schema.String },
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  RequestedToast: { request: ToastRequest },
  /** The server confirmed new settings: tell the user, and let mirrors of them refresh. */
  SavedSettings: {},
  ImportedSettings: {},
})
export type OutMessage = typeof OutMessage.Type

// COMMAND

export const FetchSettings = Command.define("FetchSettings", {
  messages: [Message.SucceededFetchSettings, Message.FailedFetchSettings],
  execute: callApi((client) => client.settings.get()).pipe(
    Effect.match({
      onSuccess: (config) => Message.SucceededFetchSettings({ config }),
      onFailure: ({ message }) => Message.FailedFetchSettings({ reason: message }),
    }),
  ),
})

export const FetchKomgaLibraries = Command.define("FetchKomgaLibraries", {
  messages: [Message.SucceededFetchLibraries, Message.FailedFetchLibraries],
  execute: callApi((client) => client.komga.libraries()).pipe(
    Effect.match({
      onSuccess: (libraries) => Message.SucceededFetchLibraries({ libraries }),
      onFailure: ({ message }) => Message.FailedFetchLibraries({ reason: message }),
    }),
  ),
})

export const SaveSettings = Command.define("SaveSettings", {
  args: { config: AppConfigSchema },
  messages: [Message.SucceededSaveSettings, Message.FailedSaveSettings],
  execute: ({ config }) =>
    callApi((client) => client.settings.update({ payload: config })).pipe(
      Effect.match({
        onSuccess: () => Message.SucceededSaveSettings({ config }),
        onFailure: ({ message }) => Message.FailedSaveSettings({ reason: message }),
      }),
    ),
})

export const TestTelegram = Command.define("TestTelegram", {
  messages: [Message.SucceededTestTelegram, Message.FailedTestTelegram],
  execute: callApi((client) => client.telegram.test()).pipe(
    Effect.match({
      onSuccess: () => Message.SucceededTestTelegram(),
      onFailure: ({ message }) => Message.FailedTestTelegram({ reason: message }),
    }),
  ),
})

export const ExportSettings = Command.define("ExportSettings", {
  messages: [Message.SucceededExportSettings, Message.FailedExportSettings],
  execute: callApi((client) => client.settings.export()).pipe(
    Effect.tap((config) => downloadJson(EXPORT_FILE_NAME, config)),
    Effect.match({
      onSuccess: () => Message.SucceededExportSettings(),
      onFailure: ({ message }) => Message.FailedExportSettings({ reason: message }),
    }),
  ),
})

const parseJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))

export const importFile = (file: File.File) =>
  File.readAsText(file).pipe(
    Effect.mapError(() => ({ message: "Could not read the file" })),
    Effect.flatMap((text) =>
      parseJson(text).pipe(Effect.mapError(() => ({ message: "The file is not valid JSON" }))),
    ),
    Effect.flatMap((payload) => callApi((client) => client.settings.import({ payload }))),
    Effect.as(Message.SucceededImportSettings()),
    Effect.catch(({ message }) =>
      Effect.succeed(Message.FailedImportSettings({ reason: message })),
    ),
  )

export const ImportSettings = Command.define("ImportSettings", {
  messages: [
    Message.CancelledImportSettings,
    Message.SucceededImportSettings,
    Message.FailedImportSettings,
  ],
  execute: Effect.gen(function* () {
    const maybeFile = yield* File.select([".json", "application/json"])

    if (Option.isNone(maybeFile)) {
      return Message.CancelledImportSettings()
    }

    return yield* importFile(maybeFile.value)
  }),
})

// INIT

/** Called when the route is entered: (re)load everything from the server. */
export const enter = (
  isKomgaNotConfigured: boolean,
): Update.ReturnWithOutMessage<Model, Message, OutMessage, ApiClientService> => ({
  model: {
    form: FormData.Loading(),
    libraries: LibrariesData.Idle(),
    isKomgaNotConfigured,
    isSaving: false,
    isTestingTelegram: false,
    isTransferring: false,
  },
  commands: [FetchSettings()],
})

export const init = (): UpdateReturn => ({ model: enter(false).model })

// UPDATE

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, ApiClientService>

const toastOut = (request: ToastRequest) => OutMessage.RequestedToast({ request })

/** What gets saved: the draft with the KCC form's last valid value. */
export const currentConfig = (form: Form): AppConfig => ({ ...form.draft, kcc: form.kcc.value })

const mapForm = (model: Model, change: (form: Form) => Form): Model =>
  modifyFields(model, { form: (form) => AsyncData.map(form, change) })

const librariesCommands = (config: AppConfig) =>
  hasKomgaCredentials(config) ? [FetchKomgaLibraries()] : []

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    // A second in-flight load (navigate away and back quickly) must not wipe edits.
    SucceededFetchSettings: ({ config }) =>
      AsyncData.hasData(model.form)
        ? { model }
        : {
            model: modifyFields(model, {
              form: () =>
                FormData.Success({
                  data: { saved: config, draft: config, kcc: Kcc.init(config.kcc) },
                }),
              libraries: () =>
                hasKomgaCredentials(config) ? LibrariesData.Loading() : LibrariesData.Idle(),
            }),
            commands: librariesCommands(config),
          },

    FailedFetchSettings: ({ reason }) => ({
      model: modifyFields(model, { form: () => FormData.Failure({ error: reason }) }),
    }),

    SucceededFetchLibraries: ({ libraries }) => ({
      model: modifyFields(model, { libraries: () => LibrariesData.Success({ data: libraries }) }),
    }),

    FailedFetchLibraries: ({ reason }) => ({
      model: modifyFields(model, { libraries: () => LibrariesData.Failure({ error: reason }) }),
    }),

    ChangedText: ({ field, value }) => ({
      model: mapForm(model, (form) => ({
        ...form,
        draft: writeSettingsText[field](form.draft, value),
      })),
    }),

    GotKccMessage: ({ message }) => ({
      model: mapForm(model, (form) => ({ ...form, kcc: Kcc.update(form.kcc, message) })),
    }),

    ClickedSave: () =>
      AsyncData.matchData(model.form, {
        onEmpty: () => ({ model }),
        onFailure: () => ({ model }),
        onData: (form): UpdateReturn =>
          model.isSaving || !Kcc.isValid(form.kcc)
            ? { model }
            : {
                model: modifyFields(model, { isSaving: () => true }),
                commands: [SaveSettings({ config: currentConfig(form) })],
              },
      }),

    SucceededSaveSettings: ({ config }) => ({
      model: modifyFields(
        mapForm(model, (form) => ({ ...form, saved: config })),
        { isSaving: () => false, isKomgaNotConfigured: () => false },
      ),
      commands: librariesCommands(config),
      outMessage: OutMessage.SavedSettings(),
    }),

    FailedSaveSettings: ({ reason }) => ({
      model: modifyFields(model, { isSaving: () => false }),
      outMessage: toastOut(toast.error("Failed to save settings", reason)),
    }),

    ClickedTestTelegram: () =>
      model.isTestingTelegram
        ? { model }
        : {
            model: modifyFields(model, { isTestingTelegram: () => true }),
            commands: [TestTelegram()],
          },

    SucceededTestTelegram: () => ({
      model: modifyFields(model, { isTestingTelegram: () => false }),
      outMessage: toastOut(toast.success("Telegram test message sent.")),
    }),

    FailedTestTelegram: ({ reason }) => ({
      model: modifyFields(model, { isTestingTelegram: () => false }),
      outMessage: toastOut(toast.error("Failed to send Telegram test message", reason)),
    }),

    ClickedExport: () =>
      model.isTransferring
        ? { model }
        : {
            model: modifyFields(model, { isTransferring: () => true }),
            commands: [ExportSettings()],
          },

    SucceededExportSettings: () => ({
      model: modifyFields(model, { isTransferring: () => false }),
      outMessage: toastOut(toast.success("Settings exported successfully.")),
    }),

    FailedExportSettings: ({ reason }) => ({
      model: modifyFields(model, { isTransferring: () => false }),
      outMessage: toastOut(toast.error("Failed to export settings", reason)),
    }),

    ClickedImport: () =>
      model.isTransferring
        ? { model }
        : {
            model: modifyFields(model, { isTransferring: () => true }),
            commands: [ImportSettings()],
          },

    CancelledImportSettings: () => ({
      model: modifyFields(model, { isTransferring: () => false }),
    }),

    // The imported values replace the form wholesale, so reload it.
    SucceededImportSettings: () => ({
      model: modifyFields(model, {
        isTransferring: () => false,
        form: () => FormData.Loading(),
        libraries: () => LibrariesData.Idle(),
      }),
      commands: [FetchSettings()],
      outMessage: OutMessage.ImportedSettings(),
    }),

    FailedImportSettings: ({ reason }) => ({
      model: modifyFields(model, { isTransferring: () => false }),
      outMessage: toastOut(toast.error("Failed to import settings", reason)),
    }),
  })

// VIEW

const ALL_LIBRARIES = { value: "", label: "All libraries" } as const

export type LibrarySelectState =
  | Readonly<{ kind: "NoCredentials" }>
  | Readonly<{ kind: "Loading" }>
  | Readonly<{ kind: "Failed" }>
  | Readonly<{ kind: "Ready"; libraries: ReadonlyArray<KomgaLibrary> }>

/** Why the Default Library select is (or isn't) usable right now. */
export const librarySelectState = (form: Form, libraries: Model["libraries"]): LibrarySelectState =>
  hasKomgaCredentials(form.saved)
    ? AsyncData.matchData(libraries, {
        onEmpty: (): LibrarySelectState => ({ kind: "Loading" }),
        onFailure: (): LibrarySelectState => ({ kind: "Failed" }),
        onData: (data): LibrarySelectState => ({ kind: "Ready", libraries: data }),
      })
    : { kind: "NoCredentials" }

const libraryOptions = (state: LibrarySelectState) => {
  switch (state.kind) {
    case "Ready":
      return [ALL_LIBRARIES, ...state.libraries.map(({ id, name }) => ({ value: id, label: name }))]
    case "NoCredentials":
      return [{ value: "", label: "Save URL & API key first" }]
    case "Loading":
      return [{ value: "", label: "Loading libraries..." }]
    case "Failed":
      return [{ value: "", label: "Failed to load libraries" }]
  }
}

const bannerClass = "island-shell mb-6 rounded-2xl p-4 text-sm"

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  const text = (
    form: Form,
    field: SettingsTextField,
    label: string,
    extras: Readonly<{ type?: string; placeholder?: string; description?: string }> = {},
  ): Html =>
    textField(h, {
      id: `settings-${field}`,
      label,
      value: readSettingsText[field](form.draft),
      onInput: (value) => Message.ChangedText({ field, value }),
      ...extras,
    })

  const formView = (form: Form): Html => {
    const librarySelect = librarySelectState(form, model.libraries)

    return h.form(
      [
        h.Class("grid grid-cols-1 items-start gap-4 lg:grid-cols-2"),
        h.OnSubmit(Message.ClickedSave()),
      ],
      [
        fieldsetCard(h, {
          id: "settings-prowlarr",
          legend: "Prowlarr",
          children: [
            text(form, "prowlarr.url", "URL", {
              type: "url",
              placeholder: "http://localhost:9696",
            }),
            text(form, "prowlarr.apiKey", "API Key", {
              type: "password",
              placeholder: "Your Prowlarr API key",
            }),
          ],
        }),
        fieldsetCard(h, {
          id: "settings-annas-archive",
          legend: "Anna's Archive",
          children: [
            text(form, "annasArchive.baseUrl", "Base URL", {
              type: "url",
              placeholder: "https://annas-archive.gl",
            }),
            text(form, "annasArchive.apiKey", "API Key", {
              type: "password",
              placeholder: "Your Anna's Archive member API key",
            }),
          ],
        }),
        fieldsetCard(h, {
          id: "settings-alldebrid",
          legend: "AllDebrid",
          children: [
            text(form, "alldebrid.apiKey", "API Key", {
              type: "password",
              placeholder: "Your AllDebrid API key",
            }),
          ],
        }),
        fieldsetCard(h, {
          id: "settings-copyparty",
          legend: "Copyparty",
          children: [
            text(form, "copyparty.url", "URL", {
              type: "url",
              placeholder: "http://localhost:3923",
            }),
            text(form, "copyparty.uploadPath", "Upload Path", { placeholder: "/" }),
            text(form, "copyparty.password", "Password (leave empty if none)", {
              type: "password",
              placeholder: "Password",
            }),
          ],
        }),
        fieldsetCard(h, {
          id: "settings-komga",
          legend: "Komga",
          children: [
            text(form, "komga.url", "URL", {
              type: "url",
              placeholder: "https://komga.example.com",
            }),
            text(form, "komga.apiKey", "API Key", {
              type: "password",
              placeholder: "Your Komga API key",
            }),
            selectField(h, {
              id: "settings-komga-default-library",
              label: "Default Library",
              value: form.draft.komga.defaultLibraryId,
              options: libraryOptions(librarySelect),
              isDisabled: librarySelect.kind !== "Ready",
              onChange: (value) => Message.ChangedText({ field: "komga.defaultLibraryId", value }),
            }),
          ],
        }),
        fieldsetCard(h, {
          id: "settings-general",
          legend: "General",
          children: [
            text(form, "general.publicUrl", "Public URL", {
              type: "url",
              placeholder: "https://inkpipe.example.com",
              description:
                'The address this app is reachable at from outside — used to build links (e.g. "see the web UI" in Telegram notifications). Leave empty to skip those links.',
            }),
          ],
        }),
        fieldsetCard(h, {
          id: "settings-telegram",
          legend: "Telegram",
          children: [
            text(form, "telegram.botToken", "Bot Token", {
              type: "password",
              placeholder: "123456:ABC-DEF...",
            }),
            text(form, "telegram.chatId", "Chat ID", { placeholder: "123456789" }),
            h.div(
              [h.Class("flex items-center gap-3")],
              [
                h.button(
                  [
                    h.Type("button"),
                    h.Disabled(model.isTestingTelegram),
                    h.OnClick(Message.ClickedTestTelegram()),
                    h.Class(buttonClass.secondary),
                  ],
                  [model.isTestingTelegram ? "Sending..." : "Send Test Message"],
                ),
                h.p(
                  [h.Class("text-sm text-secondary")],
                  ["Save settings first — the test uses the saved bot token and chat ID."],
                ),
              ],
            ),
          ],
        }),
        fieldsetCard(h, {
          id: "settings-kcc",
          legend: "KCC",
          children: [
            h.submodel({
              slotId: "settings-kcc-options",
              model: form.kcc,
              view: Kcc.view,
              viewInputs: { idPrefix: "settings-kcc", excludeDockerImage: false },
              toParentMessage: (message) => Message.GotKccMessage({ message }),
            }),
          ],
        }),
        h.div([h.Class("col-span-full h-20"), h.AriaHidden(true)]),
        h.div(
          [
            h.Class(
              "fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur",
            ),
          ],
          [
            h.div(
              [h.Class("page-wrap py-3")],
              [
                ...(Kcc.invalidCount(form.kcc) === 0
                  ? []
                  : [
                      h.p(
                        [h.Role("alert"), h.Class("mb-2 text-xs text-red-600")],
                        [
                          `Fix ${Kcc.invalidCount(form.kcc)} invalid KCC ${Kcc.invalidCount(form.kcc) === 1 ? "field" : "fields"} to save.`,
                        ],
                      ),
                    ]),
                h.button(
                  [
                    h.Type("submit"),
                    h.Disabled(model.isSaving || !Kcc.isValid(form.kcc)),
                    h.Class(buttonClass.submit),
                  ],
                  [model.isSaving ? "Saving..." : "Save Settings"],
                ),
              ],
            ),
          ],
        ),
      ],
    )
  }

  return h.main(
    [h.Class("page-wrap pb-8 pt-8 sm:px-4")],
    [
      pageHeader(h, { numeral: "VI", label: "Settings", title: "Settings" }),
      h.div(
        [h.Class("mb-6 flex items-center justify-end")],
        [
          h.div(
            [h.Class("flex gap-2")],
            [
              h.button(
                [
                  h.Type("button"),
                  h.Disabled(model.isTransferring),
                  h.OnClick(Message.ClickedExport()),
                  h.Class(buttonClass.secondary),
                ],
                ["Export Settings"],
              ),
              h.button(
                [
                  h.Type("button"),
                  h.Disabled(model.isTransferring),
                  h.OnClick(Message.ClickedImport()),
                  h.Class(buttonClass.secondary),
                ],
                ["Import Settings"],
              ),
            ],
          ),
        ],
      ),
      ...(model.isKomgaNotConfigured
        ? [
            h.div(
              [
                h.Role("status"),
                h.Class(`${bannerClass} border-amber-200 bg-amber-50 text-amber-700`),
              ],
              ["Komga is not configured yet. Please enter your Komga URL and API key below."],
            ),
          ]
        : []),
      AsyncData.matchData(model.form, {
        onEmpty: () => h.p([h.Class("text-sm text-secondary")], ["Loading settings..."]),
        onFailure: (reason) =>
          h.div(
            [h.Role("alert"), h.Class(`${bannerClass} border-red-200 text-red-600`)],
            [`Failed to load settings: ${reason}`],
          ),
        onData: formView,
      }),
    ],
  )
})
