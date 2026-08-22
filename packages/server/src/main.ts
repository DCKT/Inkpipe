import { Effect, Layer } from "effect"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { DbMigratedLayer } from "@inkpipe/db"
import { ConfigServiceLive } from "./layers/core/Config"
import type { ConfigService } from "./layers/core/Config"
import { JobStoreServiceLive } from "./layers/storage/JobStore"
import type { JobStoreService } from "./layers/storage/JobStore"
import { LogServiceLive } from "./layers/core/Log"
import type { LogService } from "./layers/core/Log"
import { ProwlarrServiceLive } from "./layers/integrations/Prowlarr"
import type { ProwlarrService } from "./layers/integrations/Prowlarr"
import { AllDebridServiceLive } from "./layers/integrations/AllDebrid"
import type { AllDebridService } from "./layers/integrations/AllDebrid"
import { KomgaServiceLive } from "./layers/integrations/Komga"
import type { KomgaService } from "./layers/integrations/Komga"
import { TelegramServiceLive } from "./layers/integrations/Telegram"
import type { TelegramService } from "./layers/integrations/Telegram"
import { CopypartyServiceLive } from "./layers/integrations/Copyparty"
import type { CopypartyService } from "./layers/integrations/Copyparty"
import { KccServiceLive } from "./layers/integrations/Kcc"
import type { KccService } from "./layers/integrations/Kcc"
import { AnnasArchiveServiceLive } from "./layers/integrations/AnnasArchive"
import type { AnnasArchiveService } from "./layers/integrations/AnnasArchive"
import { AnnasArchivePipelineServiceLive } from "./layers/pipeline/AnnasArchivePipeline"
import type { AnnasArchivePipelineService } from "./layers/pipeline/AnnasArchivePipeline"
import { FileManagerServiceLive } from "./layers/pipeline/FileManager"
import type { FileManagerService } from "./layers/pipeline/FileManager"
import { PipelineServiceLive } from "./layers/pipeline/Pipeline"
import type { PipelineService } from "./layers/pipeline/Pipeline"
import { WatchStoreServiceLive } from "./layers/storage/WatchStore"
import type { WatchStoreService } from "./layers/storage/WatchStore"
import { PushServiceLive } from "./layers/pipeline/Push"
import type { PushService } from "./layers/pipeline/Push"
import { TelegramCallbackListenerServiceLive } from "./layers/pipeline/TelegramCallbackListener"
import { TelegramCallbackListenerService } from "./layers/pipeline/TelegramCallbackListener"
import { HttpServerLive } from "./api/server"

type AllServices = PushService | LogService | ConfigService | JobStoreService | FileManagerService | ProwlarrService | AllDebridService | KomgaService | CopypartyService | KccService | PipelineService | WatchStoreService | AnnasArchiveService | AnnasArchivePipelineService | TelegramService

// Base layer — services with no dependencies of their own.
// PushServiceLive requires LogService; use provideMerge to satisfy it
// while keeping LogService available for other layers.
const BaseLayer = Layer.mergeAll(
  DbMigratedLayer,
  Layer.provideMerge(PushServiceLive, LogServiceLive),
  FileManagerServiceLive,
)

// Config + JobStore depend on SqlClient (in BaseLayer)
const ConfigLayer = Layer.provide(ConfigServiceLive, BaseLayer)
const JobStoreLayer = Layer.provide(JobStoreServiceLive, BaseLayer)

// Services that depend on ConfigService
const ProwlarrLayer = Layer.provide(ProwlarrServiceLive, Layer.mergeAll(BaseLayer, ConfigLayer))
const AllDebridLayer = Layer.provide(AllDebridServiceLive, Layer.mergeAll(BaseLayer, ConfigLayer))
const KomgaLayer = Layer.provide(KomgaServiceLive, Layer.mergeAll(BaseLayer, ConfigLayer))
const TelegramLayer = Layer.provide(TelegramServiceLive, Layer.mergeAll(BaseLayer, ConfigLayer))
const CopypartyLayer = Layer.provide(CopypartyServiceLive, Layer.mergeAll(BaseLayer, ConfigLayer))
const KccLayer = Layer.provide(KccServiceLive, Layer.mergeAll(BaseLayer, ConfigLayer))
const AnnasArchiveLayer = Layer.provide(AnnasArchiveServiceLive, Layer.mergeAll(BaseLayer, ConfigLayer))

// Pipeline needs services from multiple layers during construction
const PipelineLayer = Layer.provide(
  PipelineServiceLive,
  Layer.mergeAll(BaseLayer, ConfigLayer, JobStoreLayer, AllDebridLayer, KccLayer, CopypartyLayer),
)

const AnnasArchivePipelineLayer = Layer.provide(
  AnnasArchivePipelineServiceLive,
  Layer.mergeAll(BaseLayer, ConfigLayer, JobStoreLayer, AnnasArchiveLayer, CopypartyLayer),
)

const WatchStoreLayer = Layer.provide(WatchStoreServiceLive, BaseLayer)

// Receives Telegram button taps (long-polling) and triggers pipeline
// downloads or AllDebrid magnet saves, depending on the tapped button;
// needs ConfigService (chat/bot credentials), TelegramService,
// WatchStoreService, PipelineService, and AllDebridService, so it must be
// built after those.
const TelegramCallbackListenerLayer = Layer.provide(
  TelegramCallbackListenerServiceLive,
  Layer.mergeAll(BaseLayer, ConfigLayer, TelegramLayer, WatchStoreLayer, PipelineLayer, AllDebridLayer),
)

// The listener's `run` is an infinite loop, so it must be forked via
// `forkDetach` (v4's daemon fork — attached to the global scope, survives
// this effect and the layer's own scope) rather than awaited — otherwise
// building this layer would never complete and the HTTP server would
// never start.
const TelegramCallbackListenerRunnerLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const listener = yield* TelegramCallbackListenerService
    yield* Effect.forkDetach(listener.run)
  }),
).pipe(Layer.provide(TelegramCallbackListenerLayer))

const MainLayer = Layer.mergeAll(
  BaseLayer,
  ConfigLayer,
  JobStoreLayer,
  ProwlarrLayer,
  AllDebridLayer,
  KomgaLayer,
  TelegramLayer,
  CopypartyLayer,
  KccLayer,
  PipelineLayer,
  WatchStoreLayer,
  AnnasArchiveLayer,
  AnnasArchivePipelineLayer,
  TelegramCallbackListenerRunnerLive,
) as Layer.Layer<AllServices, never, never>

const PORT = Number(process.env.PORT || 3000)

// HttpServerLive (packages/server/src/api/server.ts) needs the app's own
// services (from MainLayer) and an HttpServer.HttpServer (from BunHttpServer).
const ServerLive = HttpServerLive.pipe(
  Layer.provide(MainLayer),
  Layer.provide(BunHttpServer.layer({ port: PORT })),
)

BunRuntime.runMain(Layer.launch(ServerLive))
