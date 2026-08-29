import { Layer } from "effect"
import { BunHttpClient } from "@effect/platform-bun"
import { Otlp, OtlpSerialization } from "effect/unstable/observability"

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

/**
 * Exports traces and metrics to `OTEL_EXPORTER_OTLP_ENDPOINT`; a no-op layer when unset.
 * Does not export logs: LogService (./Log.ts) writes to process.stderr directly rather
 * than through Effect's Logger, so OtlpLogger never sees application log lines.
 */
export const makeOtelLive = (serviceName: string): Layer.Layer<never> =>
  endpoint
    ? Otlp.layer({
        baseUrl: endpoint,
        resource: { serviceName, serviceVersion: process.env.npm_package_version },
      }).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(BunHttpClient.layer))
    : Layer.empty
