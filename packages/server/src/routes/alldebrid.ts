import { Effect } from "effect"
import { NoMagnetUrl } from "@inkpipe/shared"
import { AllDebridService } from "../layers/integrations/AllDebrid"

export const saveMagnetHandler = (body: { magnetUrl?: string | null; downloadUrl?: string | null }) =>
  Effect.gen(function* () {
    const allDebrid = yield* AllDebridService

    const target = body.magnetUrl ?? body.downloadUrl
    if (!target) {
      return yield* Effect.fail(new NoMagnetUrl({ message: "No magnet or download URL provided" }))
    }

    const result = yield* allDebrid.uploadMagnet(target)
    return Response.json(result)
  }).pipe(
    Effect.catch((e: { message: string }) =>
      Effect.succeed(
        Response.json({ error: e.message }, { status: 502 }),
      ),
    ),
  )
