import { Layer } from "effect"
import { BunHttpClient } from "@effect/platform-bun"
import { Otlp, OtlpSerialization } from "effect/unstable/observability"

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

/** Exports traces/metrics/logs to `OTEL_EXPORTER_OTLP_ENDPOINT`; a no-op layer when unset. */
export const makeOtelLive = (serviceName: string): Layer.Layer<never> =>
  endpoint
    ? Otlp.layer({
        baseUrl: endpoint,
        resource: { serviceName, serviceVersion: process.env.npm_package_version },
        // Otherwise Effect's default console logger stays active alongside the
        // OTLP one, double-printing every log line (once per logger).
        loggerMergeWithExisting: false,
      }).pipe(Layer.provide(OtlpSerialization.layerJson), Layer.provide(BunHttpClient.layer))
    : Layer.empty
