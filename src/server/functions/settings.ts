import { createServerFn } from '@tanstack/react-start'
import { loadConfig, saveConfig, type AppConfig } from '../../lib/config'

export const getSettingsFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<AppConfig> => {
    return loadConfig()
  })

export const updateSettingsFn = createServerFn({ method: 'POST' })
  .inputValidator((input: AppConfig) => input)
  .handler(async ({ data }) => {
    await saveConfig(data)
    return { success: true }
  })
