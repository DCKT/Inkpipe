import { Effect } from "effect"
import { CopypartyService } from "../layers/Copyparty"

export const copypartyFoldersHandler = Effect.gen(function* () {
  const copyparty = yield* CopypartyService
  const folders = yield* copyparty.listFolders
  return Response.json({ folders })
}).pipe(
  Effect.catchAll((e: { message: string }) =>
    Effect.succeed(
      Response.json({ error: e.message }, { status: 502 }),
    ),
  ),
)

export const createFolderHandler = (body: { name: string }) =>
  Effect.gen(function* () {
    const copyparty = yield* CopypartyService
    yield* copyparty.createFolder(body.name)
    return Response.json({ name: body.name })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 502 }),
      ),
    ),
  )

export const deleteFolderHandler = (body: { name: string }) =>
  Effect.gen(function* () {
    const copyparty = yield* CopypartyService
    yield* copyparty.deleteFolder(body.name)
    return Response.json({ name: body.name })
  }).pipe(
    Effect.catchAll((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 502 }),
      ),
    ),
  )
