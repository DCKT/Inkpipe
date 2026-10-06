import { implement } from "@inkpipe/capability/implement"
import { getLatestContract, searchProwlarrContract } from "@inkpipe/shared"
import { ProwlarrService } from "../layers/integrations/Prowlarr"

export const searchProwlarr = implement(searchProwlarrContract, ({ q }) =>
  ProwlarrService.use((prowlarr) => prowlarr.search(q ?? "")),
)

export const getLatest = implement(getLatestContract, () =>
  ProwlarrService.use((prowlarr) => prowlarr.getLatest),
)

export const prowlarrCapabilities = [searchProwlarr, getLatest] as const
