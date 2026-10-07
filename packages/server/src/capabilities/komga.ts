import { implement } from "@inkpipe/capability/implement"
import {
  getKomgaThumbnailContract,
  listKomgaBooksContract,
  listKomgaLibrariesContract,
  listKomgaSeriesContract,
} from "@inkpipe/shared"
import { Effect } from "effect"
import { KomgaService } from "../layers/integrations/Komga"

export const listKomgaLibraries = implement(listKomgaLibrariesContract, () =>
  KomgaService.use((komga) => komga.listLibraries),
)

export const listKomgaSeries = implement(listKomgaSeriesContract, ({ libraryId }) =>
  KomgaService.use((komga) => komga.listAllSeries(libraryId)),
)

export const getKomgaThumbnail = implement(getKomgaThumbnailContract, ({ seriesId }) =>
  KomgaService.use((komga) => komga.getSeriesThumbnail(seriesId)).pipe(
    Effect.map((thumbnail) => ({ thumbnail })),
  ),
)

export const listKomgaBooks = implement(listKomgaBooksContract, ({ seriesId }) =>
  KomgaService.use((komga) => komga.getBooksForSeries(seriesId)),
)

export const komgaCapabilities = [
  listKomgaLibraries,
  listKomgaSeries,
  getKomgaThumbnail,
  listKomgaBooks,
] as const
