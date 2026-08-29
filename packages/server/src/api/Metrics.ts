// RED (rate/errors/duration) metrics for every HTTP request, exported via the
// OTLP metrics pipeline (see layers/core/Otel.ts) when configured.
import { Context, Effect, Metric } from "effect"
import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

const requestsTotal = Metric.counter("http_requests_total", {
  description: "Total HTTP requests handled",
})

const requestDuration = Metric.histogram("http_request_duration_seconds", {
  description: "HTTP request duration in seconds",
  boundaries: Metric.exponentialBoundaries({ start: 0.005, factor: 2, count: 15 }),
})

export const metrics: <E, R>(
  httpApp: Effect.Effect<HttpServerResponse.HttpServerResponse, E, HttpServerRequest.HttpServerRequest | R>,
) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, HttpServerRequest.HttpServerRequest | R> =
  HttpMiddleware.make((httpApp) =>
    Effect.withFiber((fiber) => {
      const request = Context.getUnsafe(fiber.context, HttpServerRequest.HttpServerRequest)
      const start = performance.now()
      return Effect.flatMap(Effect.exit(httpApp), (exit) => {
        const durationSeconds = (performance.now() - start) / 1000
        const status = exit._tag === "Success" ? String(exit.value.status) : "error"
        const attrs = { method: request.method, status }
        return Effect.andThen(
          Effect.andThen(
            Metric.update(Metric.withAttributes(requestsTotal, attrs), 1),
            Metric.update(Metric.withAttributes(requestDuration, attrs), durationSeconds),
          ),
          exit,
        )
      })
    }),
  )
