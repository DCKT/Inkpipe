import { Context, Effect, Layer } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  type AppConfig,
  ConfigLoadError,
  ConfigSaveError,
} from "@inkpipe/shared"

export class ConfigService extends Context.Service<
  ConfigService,
  {
    readonly loadConfig: Effect.Effect<AppConfig, ConfigLoadError>
    readonly saveConfig: (config: AppConfig) => Effect.Effect<void, ConfigSaveError>
  }
>()("ConfigService") {}

/**
 * Loads config, selects an integration's section, and fails with `makeError`
 * if either the load fails or the section isn't configured — the "load →
 * guard → fail *NotConfigured" boilerplate every integration service repeats
 * (config load errors and "not configured" are collapsed into one typed
 * error since callers only ever want to react to "I can't reach this
 * integration", not distinguish why).
 */
export function requireConfigured<Section, E>(
  configService: typeof ConfigService.Service,
  select: (config: AppConfig) => Section,
  isConfigured: (section: Section) => boolean,
  notConfiguredMessage: string,
  makeError: (message: string) => E,
): Effect.Effect<Section, E> {
  return configService.loadConfig.pipe(
    Effect.mapError((e) => makeError(e.message)),
    Effect.flatMap((config) => {
      const section = select(config)
      return isConfigured(section)
        ? Effect.succeed(section)
        : Effect.fail(makeError(notConfiguredMessage))
    }),
  )
}

interface ProwlarrRow {
  url: string
  apiKey: string
}

interface AlldebridRow {
  apiKey: string
}

interface KccRow {
  dockerImage: string
  profile: string
  format: string
  mangaStyle: number
  webtoon: number
  twoPanel: number
  upscale: number
  stretch: number
  hq: number
  gamma: number
  cropping: string
  croppingPower: number
  forceColor: number
  forcePng: number
  noAutoContrast: number
  blackBorders: number
  whiteBorders: number
  splitter: string
  noProcessing: number
  eraseRainbow: number
  coverFill: number
  batchSplit: string
  targetSize: number
  customWidth: number
  customHeight: number
  noKepub: number
}

interface CopypartyRow {
  url: string
  uploadPath: string
  password: string
}

interface KomgaRow {
  url: string
  apiKey: string
  defaultLibraryId: string
}

interface AnnasArchiveRow {
  apiKey: string
  baseUrl: string
}

export const ConfigServiceLive = Layer.effect(
  ConfigService,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const loadConfig = Effect.gen(function* () {
      const [prowlarrRows, alldebridRows, kccRows, copypartyRows, komgaRows, annasArchiveRows] =
        yield* Effect.all([
          sql<ProwlarrRow>`SELECT url, api_key FROM prowlarr_config WHERE id = 1`,
          sql<AlldebridRow>`SELECT api_key FROM alldebrid_config WHERE id = 1`,
          sql<KccRow>`SELECT * FROM kcc_config WHERE id = 1`,
          sql<CopypartyRow>`SELECT url, upload_path, password FROM copyparty_config WHERE id = 1`,
          sql<KomgaRow>`SELECT url, api_key, default_library_id FROM komga_config WHERE id = 1`,
          sql<AnnasArchiveRow>`SELECT api_key, base_url FROM annas_archive_config WHERE id = 1`,
        ], { concurrency: "unbounded" })

      const prowlarr = prowlarrRows[0]
      const alldebrid = alldebridRows[0]
      const kcc = kccRows[0]
      const copyparty = copypartyRows[0]
      const komga = komgaRows[0]
      const annasArchive = annasArchiveRows[0]

      return {
        prowlarr: { url: prowlarr?.url ?? "", apiKey: prowlarr?.apiKey ?? "" },
        alldebrid: { apiKey: alldebrid?.apiKey ?? "" },
        kcc: {
          dockerImage: kcc?.dockerImage ?? "ghcr.io/ciromattia/kcc:latest",
          profile: kcc?.profile ?? "KoBO",
          format: (kcc?.format ?? "Auto") as AppConfig["kcc"]["format"],
          mangaStyle: Boolean(kcc?.mangaStyle),
          webtoon: Boolean(kcc?.webtoon),
          twoPanel: Boolean(kcc?.twoPanel),
          upscale: kcc ? Boolean(kcc.upscale) : true,
          stretch: Boolean(kcc?.stretch),
          hq: Boolean(kcc?.hq),
          gamma: kcc?.gamma ?? 1.0,
          cropping: (kcc?.cropping ?? "1") as "0" | "1" | "2",
          croppingPower: kcc?.croppingPower ?? 1.0,
          forceColor: kcc ? Boolean(kcc.forceColor) : true,
          forcePng: Boolean(kcc?.forcePng),
          noAutoContrast: Boolean(kcc?.noAutoContrast),
          blackBorders: Boolean(kcc?.blackBorders),
          whiteBorders: Boolean(kcc?.whiteBorders),
          splitter: (kcc?.splitter ?? "0") as "0" | "1" | "2",
          noProcessing: Boolean(kcc?.noProcessing),
          eraseRainbow: kcc ? Boolean(kcc.eraseRainbow) : true,
          coverFill: Boolean(kcc?.coverFill),
          batchSplit: (kcc?.batchSplit ?? "0") as "0" | "1" | "2",
          targetSize: kcc?.targetSize ?? 0,
          customWidth: kcc?.customWidth ?? 0,
          customHeight: kcc?.customHeight ?? 0,
          noKepub: Boolean(kcc?.noKepub),
        },
        copyparty: {
          url: copyparty?.url ?? "",
          uploadPath: copyparty?.uploadPath ?? "/",
          password: copyparty?.password ?? "",
        },
        komga: {
          url: komga?.url ?? "",
          apiKey: komga?.apiKey ?? "",
          defaultLibraryId: komga?.defaultLibraryId ?? "",
        },
        annasArchive: {
          apiKey: annasArchive?.apiKey ?? "",
          baseUrl: annasArchive?.baseUrl ?? "https://annas-archive.gl",
        },
      } satisfies AppConfig
    }).pipe(
      Effect.mapError((e) =>
        new ConfigLoadError({
          message: `Failed to load config: ${e instanceof Error ? e.message : String(e)}`,
        }),
      ),
    )

    const saveConfig = (config: AppConfig) =>
      Effect.gen(function* () {
        const kcc = config.kcc
        yield* sql`UPDATE prowlarr_config SET url = ${config.prowlarr.url}, api_key = ${config.prowlarr.apiKey} WHERE id = 1`
        yield* sql`UPDATE alldebrid_config SET api_key = ${config.alldebrid.apiKey} WHERE id = 1`
        yield* sql`UPDATE kcc_config SET
          docker_image = ${kcc.dockerImage},
          profile = ${kcc.profile},
          format = ${kcc.format},
          manga_style = ${kcc.mangaStyle ? 1 : 0},
          webtoon = ${kcc.webtoon ? 1 : 0},
          two_panel = ${kcc.twoPanel ? 1 : 0},
          upscale = ${kcc.upscale ? 1 : 0},
          stretch = ${kcc.stretch ? 1 : 0},
          hq = ${kcc.hq ? 1 : 0},
          gamma = ${kcc.gamma},
          cropping = ${kcc.cropping},
          cropping_power = ${kcc.croppingPower},
          force_color = ${kcc.forceColor ? 1 : 0},
          force_png = ${kcc.forcePng ? 1 : 0},
          no_auto_contrast = ${kcc.noAutoContrast ? 1 : 0},
          black_borders = ${kcc.blackBorders ? 1 : 0},
          white_borders = ${kcc.whiteBorders ? 1 : 0},
          splitter = ${kcc.splitter},
          no_processing = ${kcc.noProcessing ? 1 : 0},
          erase_rainbow = ${kcc.eraseRainbow ? 1 : 0},
          cover_fill = ${kcc.coverFill ? 1 : 0},
          batch_split = ${kcc.batchSplit},
          target_size = ${kcc.targetSize},
          custom_width = ${kcc.customWidth},
          custom_height = ${kcc.customHeight},
          no_kepub = ${kcc.noKepub ? 1 : 0}
          WHERE id = 1`
        yield* sql`UPDATE copyparty_config SET url = ${config.copyparty.url}, upload_path = ${config.copyparty.uploadPath}, password = ${config.copyparty.password} WHERE id = 1`
        yield* sql`UPDATE komga_config SET url = ${config.komga.url}, api_key = ${config.komga.apiKey}, default_library_id = ${config.komga.defaultLibraryId} WHERE id = 1`
        yield* sql`UPDATE annas_archive_config SET api_key = ${config.annasArchive.apiKey}, base_url = ${config.annasArchive.baseUrl} WHERE id = 1`
      }).pipe(
        Effect.mapError((e) =>
          new ConfigSaveError({
            message: `Failed to save config: ${e instanceof Error ? e.message : String(e)}`,
          }),
        ),
      )

    return { loadConfig, saveConfig }
  }),
)
