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
})

const copypartySchema = z.object({
  url: z.string().default(''),
  uploadPath: z.string().default('/'),
  password: z.string().default(''),
})

const configSchema = z.object({
  prowlarr: prowlarrSchema.default({ url: '', apiKey: '' }),
  alldebrid: alldebridSchema.default({ apiKey: '' }),
  kcc: kccSchema.default({ dockerImage: 'ghcr.io/ciromattia/kcc:latest', profile: 'KLC' }),
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
