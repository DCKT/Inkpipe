import { annasArchiveContracts } from "./annas-archive"
import { copypartyContracts } from "./copyparty"
import { downloadContracts } from "./downloads"
import { jobsContracts } from "./jobs"
import { komgaContracts } from "./komga"
import { prowlarrContracts } from "./prowlarr"
import { pushContracts } from "./push"
import { settingsContracts } from "./settings"
import { telegramContracts } from "./telegram"
import { watchesContracts } from "./watches"

export * from "./annas-archive"
export * from "./copyparty"
export * from "./downloads"
export * from "./jobs"
export * from "./komga"
export * from "./prowlarr"
export * from "./push"
export * from "./settings"
export * from "./telegram"
export * from "./watches"

// Every contract the browser may call. The server implements each one as a capability.
export const allContracts = [
  ...copypartyContracts,
  ...prowlarrContracts,
  ...downloadContracts,
  ...annasArchiveContracts,
  ...jobsContracts,
  ...settingsContracts,
  ...komgaContracts,
  ...pushContracts,
  ...telegramContracts,
  ...watchesContracts,
] as const
