import { Effect } from "effect"
import { implement } from "@inkpipe/capability/implement"
import { createFolderContract, deleteFolderContract, listFoldersContract } from "@inkpipe/shared"
import { CopypartyService } from "../layers/integrations/Copyparty"

export const listFolders = implement(listFoldersContract, () =>
  CopypartyService.use((copyparty) => copyparty.listFolders).pipe(
    Effect.map((folders) => ({ folders })),
  ),
)

export const createFolder = implement(createFolderContract, ({ name }) =>
  CopypartyService.use((copyparty) => copyparty.createFolder(name)).pipe(Effect.as({ name })),
)

export const deleteFolder = implement(deleteFolderContract, ({ name }) =>
  CopypartyService.use((copyparty) => copyparty.deleteFolder(name)).pipe(Effect.as({ name })),
)

export const copypartyCapabilities = [listFolders, createFolder, deleteFolder] as const
