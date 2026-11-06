// Test-only fixtures. Not imported by app code.
import { Animation, Toast as UiToast } from "@foldkit/ui"
import { Command } from "foldkit/scene"

import { Model } from "./main"
import * as AnnasArchive from "./annasArchive"
import * as Convert from "./convert"
import * as Jobs from "./jobs"
import * as Latest from "./latest"
import * as Prowlarr from "./prowlarr"
import * as Settings from "./settings"
import * as Sidebar from "./sidebar"
import { initialToasts } from "./toast"
import type { AppRoute } from "./route"

/** A freshly-initialised root model sitting on `route`. */
export const modelAt = (route: AppRoute): Model =>
  Model.make({
    route,
    toasts: initialToasts(),
    sidebar: Sidebar.init().model,
    jobs: Jobs.init().model,
    settings: Settings.init().model,
    prowlarr: Prowlarr.init(),
    latest: Latest.init(),
    annasArchive: AnnasArchive.init(),
    convert: Convert.init(),
  })

/**
 * Scene counterpart of `Toast.test.drainEntry`: resolves a toast's whole
 * enter / auto-dismiss / leave lifecycle so a scene can end cleanly.
 */
export const drainToast = (entryId: string) =>
  Command.resolveAll(
    [
      Animation.WaitForPaint({ generation: 1 }),
      Animation.Message.CompletedWaitForPaint({ generation: 1 }),
    ],
    [
      Animation.WaitForAnimationSettled({ id: entryId, generation: 1 }),
      Animation.Message.EndedAnimation({ generation: 1 }),
    ],
    [
      UiToast.WaitBeforeDismissal,
      UiToast.Message.CompletedWaitBeforeDismissal({ entryId, version: 0 }),
    ],
    [
      Animation.WaitForPaint({ generation: 2 }),
      Animation.Message.CompletedWaitForPaint({ generation: 2 }),
    ],
    [
      Animation.WaitForAnimationSettled({ id: entryId, generation: 2 }),
      Animation.Message.EndedAnimation({ generation: 2 }),
    ],
  )
