import { annasArchiveCapabilities } from "./annas-archive"
import { copypartyCapabilities } from "./copyparty"
import { downloadCapabilities } from "./downloads"
import { jobsCapabilities } from "./jobs"
import { komgaCapabilities } from "./komga"
import { prowlarrCapabilities } from "./prowlarr"
import { pushCapabilities } from "./push"
import { settingsCapabilities } from "./settings"
import { telegramCapabilities } from "./telegram"
import { watchesCapabilities } from "./watches"

// Every capability the server exposes. Projections (HTTP today; CLI and MCP later) derive from this list.
export const capabilities = [
  ...copypartyCapabilities,
  ...prowlarrCapabilities,
  ...downloadCapabilities,
  ...annasArchiveCapabilities,
  ...jobsCapabilities,
  ...settingsCapabilities,
  ...komgaCapabilities,
  ...pushCapabilities,
  ...telegramCapabilities,
  ...watchesCapabilities,
] as const
