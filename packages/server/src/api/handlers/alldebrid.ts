import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { NoMagnetUrl } from "@inkpipe/shared"
import { AllDebridService } from "../../layers/integrations/AllDebrid"
import { InkpipeApi } from "@inkpipe/shared"

export const AllDebridGroupLive = HttpApiBuilder.group(InkpipeApi, "alldebrid", (handlers) =>
  handlers.handle("saveMagnet", ({ payload }) =>
    Effect.gen(function* () {
      const allDebrid = yield* AllDebridService

      const target = payload.magnetUrl ?? payload.downloadUrl
      if (!target) {
        return yield* new NoMagnetUrl({ message: "No magnet or download URL provided" })
      }

      return yield* allDebrid.uploadMagnet(target)
    })),
)
