import type { Dialog } from "@foldkit/ui"
import type { Html, HtmlBuilder } from "foldkit/html"

import * as FolderSelect from "./folderSelect"
import { buttonClass } from "./form"

/**
 * The "Download N items" modal body: a folder picker with Cancel/Download.
 * Returns the `toView` callback `Dialog.view` expects.
 */
export const downloadDialogView =
  <M>(
    h: HtmlBuilder<M>,
    config: {
      readonly count: number
      readonly folder: FolderSelect.Model
      readonly toFolderMessage: (message: FolderSelect.Message) => M
      readonly onConfirm: M
      /** A typed folder is still being checked: hold the confirm button. */
      readonly isConfirmDisabled: boolean
    },
  ) =>
  ({ dialog, backdrop, panel, title, closeButton, isVisible }: Dialog.RenderInfo): Html =>
    h.dialog(
      [...dialog],
      isVisible
        ? [
            h.div([...backdrop, h.Class("fixed inset-0 z-50 bg-black/50")]),
            h.div(
              [h.Class("fixed inset-0 z-50 flex items-center justify-center p-4")],
              [
                h.div(
                  [
                    ...panel,
                    h.Class(
                      "island-shell flex w-full max-w-md flex-col gap-5 rounded-2xl bg-surface p-6",
                    ),
                  ],
                  [
                    h.h2(
                      [...title, h.Class("font-display text-lg italic text-primary")],
                      [`Download ${config.count} item${config.count === 1 ? "" : "s"}`],
                    ),
                    h.submodel({
                      slotId: "download-folder",
                      model: config.folder,
                      view: FolderSelect.view,
                      viewInputs: {
                        idPrefix: "download-folder",
                        label: "Subfolder",
                        placeholder: "e.g. manga/action or leave empty",
                      },
                      toParentMessage: config.toFolderMessage,
                    }),
                    h.div(
                      [h.Class("flex justify-end gap-3")],
                      [
                        h.button([...closeButton, h.Class(buttonClass.secondary)], ["Cancel"]),
                        h.button(
                          [
                            h.Type("button"),
                            h.Disabled(config.isConfirmDisabled),
                            h.OnClick(config.onConfirm),
                            h.Class(`${buttonClass.primary} rounded-full`),
                          ],
                          ["Download"],
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ]
        : [],
    )
