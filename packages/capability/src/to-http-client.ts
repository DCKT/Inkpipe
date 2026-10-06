import { Data, Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import type { HttpClientError } from "effect/http"

import { failureSchemaOf } from "./contract.js"
import type { AnyContract, FailureOf, InputOf, NameOf, OutputOf } from "./contract.js"

// A browser-safe projection: it reads only contracts (names, routes, schemas), never handlers,
// and talks to the routes `toHttpApi` serves.

export class UnexpectedResponse extends Data.TaggedError("UnexpectedResponse")<{
  readonly status: number
  readonly message: string
}> {}

type ContractCall<C extends AnyContract> = (
  input: InputOf<C>["Type"],
) => Effect.Effect<
  OutputOf<C>["Type"],
  FailureOf<C>["Type"] | UnexpectedResponse | HttpClientError.HttpClientError | Schema.SchemaError,
  HttpClient.HttpClient
>

export type HttpClientProjection<Contracts extends readonly AnyContract[]> = {
  readonly [C in Contracts[number] as NameOf<C>]: ContractCall<C>
}

const BODY_METHODS = new Set(["PATCH", "POST", "PUT"])

const pathParams = (path: string): readonly string[] =>
  path
    .split("/")
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const queryValues = (value: unknown): readonly string[] =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value.map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      : [typeof value === "string" ? value : JSON.stringify(value)]

const callContract = (contract: AnyContract, baseUrl: string) => {
  const route = contract.http ?? { method: "POST" as const, path: `/${contract.name}` as const }
  const names = pathParams(route.path)
  const encodeInput = Schema.encodeEffect(contract.input)
  const decodeOutput = Schema.decodeUnknownEffect(contract.output)
  const decodeFailure = Schema.decodeUnknownEffect(failureSchemaOf(contract))

  return (input: unknown) =>
    Effect.gen(function* () {
      const encoded = yield* encodeInput(input as never)
      const fields = isRecord(encoded) ? encoded : {}
      const path = names.reduce(
        (url, name) => url.replace(`:${name}`, encodeURIComponent(String(fields[name]))),
        route.path as string,
      )
      const rest = Object.entries(fields).filter(([key]) => !names.includes(key))

      let request = HttpClientRequest.make(route.method)(`${baseUrl}${path}`)
      if (BODY_METHODS.has(route.method) || contract.http === undefined) {
        request = yield* HttpClientRequest.bodyJson(request, Object.fromEntries(rest))
      } else {
        for (const [key, value] of rest) {
          for (const item of queryValues(value)) {
            request = HttpClientRequest.appendUrlParam(request, key, item)
          }
        }
      }

      const client = yield* HttpClient.HttpClient
      const response = yield* client.execute(request)
      const body: unknown = yield* response.json.pipe(Effect.orElseSucceed(() => undefined))

      if (response.status >= 200 && response.status < 300) {
        return yield* decodeOutput(body)
      }

      const failure = yield* decodeFailure(body).pipe(Effect.option)
      if (failure._tag === "Some") {
        // oxlint-disable-next-line effecttsgo/any-unknown-in-error-context -- the contract's failure type is erased here; `toHttpClient` restores it on the public type.
        return yield* Effect.fail(failure.value)
      }
      const message =
        isRecord(body) && typeof body.message === "string"
          ? body.message
          : `${contract.name} failed with status ${response.status}`
      return yield* new UnexpectedResponse({ status: response.status, message })
    })
}

export const toHttpClient = <const Contracts extends readonly AnyContract[]>(
  contracts: Contracts,
  options?: { readonly baseUrl?: string | undefined },
): HttpClientProjection<Contracts> => {
  const baseUrl = options?.baseUrl ?? ""
  const entries = contracts.map((contract) => [contract.name, callContract(contract, baseUrl)])
  // SAFETY: each entry is keyed by its contract name and typed by `ContractCall<C>` through the mapped return type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions
  return Object.fromEntries(entries) as unknown as HttpClientProjection<Contracts>
}
