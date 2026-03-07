import { z } from 'zod'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const prowlarrSchema = z.object({
  url: z.string().default(''),
  apiKey: z.string().default(''),
})

const alldebridSchema = z.object({
  apiKey: z.string().default(''),
})

const kccSchema = z.object({
  dockerImage: z.string().default('ghcr.io/ciromattia/kcc:latest'),
  profile: z.string().default('KoBO'),
  format: z.enum(['Auto', 'MOBI', 'EPUB', 'CBZ', 'KFX', 'PDF']).default('Auto'),
  mangaStyle: z.boolean().default(false),
  webtoon: z.boolean().default(false),
  twoPanel: z.boolean().default(false),
  upscale: z.boolean().default(true),
  stretch: z.boolean().default(false),
  hq: z.boolean().default(false),
  gamma: z.number().default(1.0),
  cropping: z.enum(['0', '1', '2']).default('1'),
  croppingPower: z.number().default(1.0),
  forceColor: z.boolean().default(true),
  forcePng: z.boolean().default(false),
  noAutoContrast: z.boolean().default(false),
  blackBorders: z.boolean().default(false),
  whiteBorders: z.boolean().default(false),
  splitter: z.enum(['0', '1', '2']).default('0'),
  noProcessing: z.boolean().default(false),
  eraseRainbow: z.boolean().default(true),
  coverFill: z.boolean().default(false),
  batchSplit: z.enum(['0', '1', '2']).default('0'),
  targetSize: z.number().default(0),
  customWidth: z.number().default(0),
  customHeight: z.number().default(0),
  noKepub: z.boolean().default(false),
})

const copypartySchema = z.object({
  url: z.string().default(''),
  uploadPath: z.string().default('/'),
  password: z.string().default(''),
})

const configSchema = z.object({
  prowlarr: prowlarrSchema.default({ url: '', apiKey: '' }),
  alldebrid: alldebridSchema.default({ apiKey: '' }),
  kcc: kccSchema.default({}),
  copyparty: copypartySchema.default({ url: '', uploadPath: '/', password: '' }),
  tempDir: z.string().default(''),
  tempVolume: z.string().default(''),
})

export type AppConfig = z.infer<typeof configSchema>

const CONFIG_DIR = join(homedir(), '.inkpipe')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export async function loadConfig(): Promise<AppConfig> {
  let config: AppConfig
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8')
    config = configSchema.parse(JSON.parse(raw))
  } catch {
    config = configSchema.parse({})
  }
  const tempVolume = process.env.INKPIPE_TEMP_VOLUME
  if (tempVolume) {
    config.tempVolume = tempVolume
  }
  return config
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}
