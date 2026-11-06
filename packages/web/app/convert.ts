import { FileDrop } from "@foldkit/ui"
import { KccConfigSchema } from "@inkpipe/shared"
import { Duration, Effect, Option, Schema } from "effect"
import { AsyncData, Command, File, Submodel, Update } from "foldkit"
import type { Html } from "foldkit/html"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"
import { modifyFields } from "foldkit/struct"

import { type ApiClientService, callApi } from "./api"
import { awaitConversion, fetchResult, uploadFile } from "./convertFlow"
import { downloadBlob } from "./download"
import { buttonClass, fieldsetCard } from "./form"
import * as Kcc from "./kccOptions"
import { pageHeader } from "./pageHeader"
import { ToastRequest, toast } from "./toast"

export const DONE_RESET_DELAY = Duration.seconds(3)

// MODEL

export const Stage = defineTaggedUnion({
  Idle: {},
  Uploading: {},
  Converting: { id: Schema.String },
  Saving: { id: Schema.String, filename: Schema.String },
  Done: { filename: Schema.String },
  Failed: { reason: Schema.String },
})
export type Stage = typeof Stage.Type

const DefaultsData = AsyncData.Schema(KccConfigSchema, Schema.String)

export const Model = Schema.Struct({
  /** The saved KCC settings: what "Reset to defaults" returns to. */
  defaults: DefaultsData.schema,
  /** The options for this conversion; start as the defaults. */
  kcc: Schema.Option(Kcc.Model),
  fileDrop: FileDrop.Model,
  maybeFile: Schema.Option(File.File),
  /** Set when something other than a .cbz was dropped. */
  maybeFileProblem: Schema.Option(Schema.String),
  stage: Stage,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  SucceededFetchDefaults: { kcc: KccConfigSchema },
  FailedFetchDefaults: { reason: Schema.String },
  GotKccMessage: { message: Kcc.Message },
  ClickedResetKcc: {},
  GotFileDropMessage: { message: FileDrop.Message },
  ClickedConvert: {},
  SucceededUpload: { id: Schema.String },
  SucceededConversion: { id: Schema.String, filename: Schema.String },
  SucceededSaveFile: { filename: Schema.String },
  FailedConversion: { reason: Schema.String },
  ClickedTryAgain: {},
  CompletedWaitBeforeReset: {},
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  RequestedToast: { request: ToastRequest },
  /** KCC has no Docker image configured: conversion can't work until Settings is filled in. */
  RequestedSettings: {},
})
export type OutMessage = typeof OutMessage.Type

// COMMAND

export const FetchDefaults = Command.define("FetchDefaults", {
  messages: [Message.SucceededFetchDefaults, Message.FailedFetchDefaults],
  execute: callApi((client) => client.settings.get()).pipe(
    Effect.match({
      onSuccess: ({ kcc }) => Message.SucceededFetchDefaults({ kcc }),
      onFailure: ({ message }) => Message.FailedFetchDefaults({ reason: message }),
    }),
  ),
})

export const UploadFile = Command.define("UploadFile", {
  args: { file: File.File, options: Schema.Option(Schema.String) },
  messages: [Message.SucceededUpload, Message.FailedConversion],
  execute: ({ file, options }) =>
    uploadFile(file, options).pipe(
      Effect.match({
        onSuccess: (id) => Message.SucceededUpload({ id }),
        onFailure: ({ message }) => Message.FailedConversion({ reason: message }),
      }),
    ),
})

export const AwaitConversion = Command.define("AwaitConversion", {
  args: { id: Schema.String },
  messages: [Message.SucceededConversion, Message.FailedConversion],
  execute: ({ id }) =>
    awaitConversion(id).pipe(
      Effect.match({
        onSuccess: (filename) => Message.SucceededConversion({ id, filename }),
        onFailure: ({ message }) => Message.FailedConversion({ reason: message }),
      }),
    ),
})

export const SaveConvertedFile = Command.define("SaveConvertedFile", {
  args: { id: Schema.String, filename: Schema.String },
  messages: [Message.SucceededSaveFile, Message.FailedConversion],
  execute: ({ id, filename }) =>
    fetchResult(id).pipe(
      Effect.tap((blob) => downloadBlob(filename, blob)),
      Effect.match({
        onSuccess: () => Message.SucceededSaveFile({ filename }),
        onFailure: ({ message }) => Message.FailedConversion({ reason: message }),
      }),
    ),
})

export const WaitBeforeReset = Command.define("WaitBeforeReset", {
  messages: [Message.CompletedWaitBeforeReset],
  execute: Effect.sleep(DONE_RESET_DELAY).pipe(Effect.as(Message.CompletedWaitBeforeReset())),
})

// PURE HELPERS

export const isCbz = (file: globalThis.File): boolean => file.name.toLowerCase().endsWith(".cbz")

export const isBusy = (stage: Stage): boolean =>
  Stage.match<boolean>(stage, {
    Idle: () => false,
    Uploading: () => true,
    Converting: () => true,
    Saving: () => true,
    Done: () => false,
    Failed: () => false,
  })

/** Is the form still at the saved defaults? (Decides if "Reset" does anything.) */
export const isAtDefaults = (model: Model): boolean =>
  Option.match(AsyncData.getData(model.defaults), {
    onNone: () => true,
    onSome: (defaults) =>
      Option.exists(model.kcc, (kcc) => JSON.stringify(kcc.value) === JSON.stringify(defaults)),
  })

export const formatFileSize = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

// INIT

type UpdateReturn = Update.ReturnWithOutMessage<Model, Message, OutMessage, ApiClientService>

export const init = (): Model => ({
  defaults: DefaultsData.Idle(),
  kcc: Option.none(),
  fileDrop: FileDrop.init({ id: "convert-file" }),
  maybeFile: Option.none(),
  maybeFileProblem: Option.none(),
  stage: Stage.Idle(),
})

// UPDATE

/** Entering the page loads the saved KCC defaults (sending people to Settings if unconfigured). */
export const enter = (model: Model): UpdateReturn => ({
  model: modifyFields(model, {
    defaults: (defaults) => Option.getOrElse(AsyncData.revalidateOrLoad(defaults), () => defaults),
  }),
  commands: [FetchDefaults()],
})

const foldFileDropOutMessage = FileDrop.OutMessage.match<Update.Step<Model, Message>>({
  ReceivedFiles:
    ({ files }) =>
    (model) => ({ model: acceptFiles(model, files) }),
  RejectedNonFiles: () => (model) => ({ model }),
})

const foldFileDrop = Update.foldChild({
  update: FileDrop.update,
  read: (model: Model) => Option.some(model.fileDrop),
  write: (model, fileDrop) => modifyFields(model, { fileDrop: () => fileDrop }),
  toParentMessage: (message) => Message.GotFileDropMessage({ message }),
  foldOutMessage: foldFileDropOutMessage,
})

/** The first .cbz among what was picked or dropped; anything else is explained. */
const acceptFiles = (model: Model, files: ReadonlyArray<globalThis.File>): Model => {
  const cbz = files.find(isCbz)

  return cbz === undefined
    ? modifyFields(model, {
        maybeFileProblem: () => Option.some("Only .cbz files can be converted."),
      })
    : modifyFields(model, {
        maybeFile: () => Option.some(cbz),
        maybeFileProblem: () => Option.none(),
      })
}

const failWith = (model: Model, reason: string): UpdateReturn => ({
  model: modifyFields(model, { stage: () => Stage.Failed({ reason }) }),
  outMessage: OutMessage.RequestedToast({ request: toast.error("Conversion failed", reason) }),
})

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    SucceededFetchDefaults: ({ kcc }) =>
      kcc.dockerImage === ""
        ? {
            model: modifyFields(model, { defaults: () => DefaultsData.Success({ data: kcc }) }),
            outMessage: OutMessage.RequestedSettings(),
          }
        : {
            model: modifyFields(model, {
              defaults: () => DefaultsData.Success({ data: kcc }),
              // Options the user changed are kept; untouched ones follow the saved defaults.
              kcc: (current) =>
                Option.isSome(current) && !isAtDefaults(model)
                  ? current
                  : Option.some(Kcc.init(kcc)),
            }),
          },

    FailedFetchDefaults: ({ reason }) => ({
      model: modifyFields(model, { defaults: () => DefaultsData.Failure({ error: reason }) }),
    }),

    GotKccMessage: ({ message }) => ({
      model: modifyFields(model, {
        kcc: (current) => Option.map(current, (kcc) => Kcc.update(kcc, message)),
      }),
    }),

    ClickedResetKcc: () => ({
      model: modifyFields(model, {
        kcc: () => Option.map(AsyncData.getData(model.defaults), Kcc.init),
      }),
    }),

    GotFileDropMessage: ({ message }) => foldFileDrop(model, message),

    ClickedConvert: () => {
      const canStart = !isBusy(model.stage) && model.stage._tag !== "Done"
      const validKcc = Option.match(model.kcc, { onNone: () => true, onSome: Kcc.isValid })

      return Option.match(model.maybeFile, {
        onNone: () => ({ model }),
        onSome: (file) =>
          canStart && validKcc
            ? {
                model: modifyFields(model, { stage: () => Stage.Uploading() }),
                commands: [
                  UploadFile({
                    file,
                    options: Option.map(model.kcc, (kcc) => JSON.stringify(kcc.value)),
                  }),
                ],
              }
            : { model },
      })
    },

    // Each step only counts if we're waiting for it.
    SucceededUpload: ({ id }) =>
      model.stage._tag === "Uploading"
        ? {
            model: modifyFields(model, { stage: () => Stage.Converting({ id }) }),
            commands: [AwaitConversion({ id })],
          }
        : { model },

    SucceededConversion: ({ id, filename }) =>
      model.stage._tag === "Converting" && model.stage.id === id
        ? {
            model: modifyFields(model, { stage: () => Stage.Saving({ id, filename }) }),
            commands: [SaveConvertedFile({ id, filename })],
          }
        : { model },

    SucceededSaveFile: ({ filename }) =>
      model.stage._tag === "Saving"
        ? {
            model: modifyFields(model, {
              stage: () => Stage.Done({ filename }),
              maybeFile: () => Option.none(),
            }),
            commands: [WaitBeforeReset()],
            outMessage: OutMessage.RequestedToast({
              request: toast.success("Conversion complete", filename),
            }),
          }
        : { model },

    FailedConversion: ({ reason }) => (isBusy(model.stage) ? failWith(model, reason) : { model }),

    ClickedTryAgain: () =>
      model.stage._tag === "Failed"
        ? {
            model: modifyFields(model, {
              stage: () => Stage.Idle(),
              maybeFile: () => Option.none(),
            }),
          }
        : { model },

    CompletedWaitBeforeReset: () =>
      model.stage._tag === "Done"
        ? { model: modifyFields(model, { stage: () => Stage.Idle() }) }
        : { model },
  })

// VIEW

const panelClass = "island-shell rounded-2xl p-8 text-center"

export const view = Submodel.defineView<Model, Message>((model, h): Html => {
  const busy = isBusy(model.stage)

  const optionsCard = fieldsetCard(h, {
    id: "convert-kcc",
    legend: "KCC Options",
    children: Option.match(model.kcc, {
      onNone: () => [
        AsyncData.match(model.defaults, {
          onIdle: () => h.p([h.Class("text-sm text-secondary")], ["Loading options…"]),
          onLoading: () => h.p([h.Class("text-sm text-secondary")], ["Loading options…"]),
          onRefreshing: () => h.p([h.Class("text-sm text-secondary")], ["Loading options…"]),
          onFailure: (reason) =>
            h.p(
              [h.Role("alert"), h.Class("text-sm text-red-600")],
              [`Couldn't load your KCC defaults: ${reason}`],
            ),
          onStale: () => h.p([h.Class("text-sm text-secondary")], ["Loading options…"]),
          onSuccess: () =>
            h.p([h.Class("text-sm text-secondary")], ["Set up KCC in Settings first."]),
        }),
      ],
      onSome: (kcc) => [
        h.submodel({
          slotId: "convert-kcc-options",
          model: kcc,
          view: Kcc.view,
          viewInputs: { idPrefix: "convert-kcc", excludeDockerImage: true },
          toParentMessage: (message) => Message.GotKccMessage({ message }),
        }),
        h.button(
          [
            h.Type("button"),
            h.Disabled(isAtDefaults(model) || busy),
            h.OnClick(Message.ClickedResetKcc()),
            h.Class(`${buttonClass.refresh} mt-4 w-full`),
          ],
          ["Reset to defaults"],
        ),
      ],
    }),
  })

  const dropZone = h.div(
    [h.Class("flex flex-col gap-4")],
    [
      h.submodel({
        slotId: "convert-file-drop",
        model: model.fileDrop,
        view: FileDrop.view,
        viewInputs: {
          accept: [".cbz"],
          isDisabled: busy,
          toView: ({ root, input }) =>
            h.label(
              [
                ...root,
                h.Class(
                  `island-shell block cursor-pointer rounded-2xl p-12 text-center transition-all focus-within:ring-2 focus-within:ring-accent ${
                    model.fileDrop.isDragOver
                      ? "border-accent bg-accent/10"
                      : "border-dashed hover:border-accent-hover"
                  }`,
                ),
              ],
              [
                h.input([...input]),
                ...Option.match(model.maybeFile, {
                  onNone: () => [
                    h.p(
                      [h.Class("text-sm font-medium text-primary")],
                      ["Drop your .cbz file here"],
                    ),
                    h.p([h.Class("text-xs text-secondary")], ["or click to browse"]),
                  ],
                  onSome: (file) => [
                    h.p(
                      [
                        h.DataAttribute("file-name", ""),
                        h.Class("text-sm font-medium text-primary"),
                      ],
                      [file.name],
                    ),
                    h.p([h.Class("text-xs text-secondary")], [formatFileSize(file.size)]),
                  ],
                }),
              ],
            ),
        },
        toParentMessage: (message) => Message.GotFileDropMessage({ message }),
      }),
      ...Option.match(model.maybeFileProblem, {
        onNone: () => [],
        onSome: (problem) => [h.p([h.Role("alert"), h.Class("text-sm text-red-600")], [problem])],
      }),
      ...Option.match(model.maybeFile, {
        onNone: () => [],
        onSome: () => [
          h.button(
            [
              h.Type("button"),
              h.Disabled(busy || Option.exists(model.kcc, (kcc) => !Kcc.isValid(kcc))),
              h.OnClick(Message.ClickedConvert()),
              h.Class(`${buttonClass.primary} rounded-xl`),
            ],
            ["Convert to EPUB"],
          ),
        ],
      }),
    ],
  )

  const statusPanel = Stage.match<Html>(model.stage, {
    Idle: () => dropZone,
    Uploading: () =>
      h.div(
        [h.Role("status"), h.Class(panelClass)],
        [
          h.p([h.Class("text-sm font-medium text-primary")], ["Uploading..."]),
          h.p([h.Class("mt-1 text-xs text-secondary")], ["Sending file to the server"]),
        ],
      ),
    Converting: () =>
      h.div(
        [h.Role("status"), h.Class(panelClass)],
        [
          h.p([h.Class("text-sm font-medium text-primary")], ["Converting with KCC..."]),
          h.p([h.Class("mt-1 text-xs text-secondary")], ["This may take a minute"]),
        ],
      ),
    Saving: () =>
      h.div(
        [h.Role("status"), h.Class(panelClass)],
        [h.p([h.Class("text-sm font-medium text-primary")], ["Preparing your download..."])],
      ),
    Done: ({ filename }) =>
      h.div(
        [h.Role("status"), h.Class(`${panelClass} border-success`)],
        [h.p([h.Class("text-sm font-semibold text-primary")], [`Download started — ${filename}`])],
      ),
    Failed: ({ reason }) =>
      h.div(
        [h.Role("alert"), h.Class(`${panelClass} border-red-200`)],
        [
          h.p([h.Class("text-sm font-medium text-red-600")], ["Conversion failed"]),
          h.p([h.Class("mt-1 text-xs text-red-500")], [reason]),
          h.button(
            [
              h.Type("button"),
              h.OnClick(Message.ClickedTryAgain()),
              h.Class(`${buttonClass.refresh} mt-4 inline-flex items-center gap-2`),
            ],
            ["Try again"],
          ),
        ],
      ),
  })

  return h.main(
    [h.Class("page-wrap pb-8 pt-8 sm:px-4")],
    [
      pageHeader(h, { numeral: "V", label: "Convert", title: "Convert CBZ to EPUB" }),
      h.div(
        [h.Class("grid grid-cols-1 items-start gap-4 lg:grid-cols-2")],
        [optionsCard, h.div([], [statusPanel])],
      ),
    ],
  )
})
