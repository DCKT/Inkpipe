import { HttpApi } from "effect/unstable/httpapi"
import { SearchGroup } from "./groups/search"
import { LatestGroup } from "./groups/latest"
import { DownloadGroup } from "./groups/download"
import { AllDebridGroup } from "./groups/alldebrid"
import { AnnasArchiveGroup } from "./groups/annas-archive"
import { JobsGroup } from "./groups/jobs"
import { SettingsGroup } from "./groups/settings"
import { ConvertGroup } from "./groups/convert"
import { KomgaGroup } from "./groups/komga"
import { CopypartyGroup } from "./groups/copyparty"
import { WatchesGroup } from "./groups/watches"
import { PushGroup } from "./groups/push"
import { SchemaErrorMiddleware } from "./middleware"

export const InkpipeApi = HttpApi.make("InkpipeApi")
  .add(SearchGroup)
  .add(LatestGroup)
  .add(DownloadGroup)
  .add(AllDebridGroup)
  .add(AnnasArchiveGroup)
  .add(JobsGroup)
  .add(SettingsGroup)
  .add(ConvertGroup)
  .add(KomgaGroup)
  .add(CopypartyGroup)
  .add(WatchesGroup)
  .add(PushGroup)
  .middleware(SchemaErrorMiddleware)
