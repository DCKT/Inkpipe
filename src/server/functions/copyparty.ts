import { createServerFn } from '@tanstack/react-start'
import { loadConfig } from '../../lib/config'
import { listCopypartyFolders } from '../../lib/api/copyparty'

export const getCopypartyFoldersFn = createServerFn({ method: 'GET' }).handler(async () => {
  const config = await loadConfig()
  return listCopypartyFolders(config)
})
