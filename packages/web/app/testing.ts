// Test-only fixtures. Not imported by app code.
import { Model } from "./main"
import * as Jobs from "./jobs"
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
  })
