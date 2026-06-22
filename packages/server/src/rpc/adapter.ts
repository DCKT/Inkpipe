import { Effect, Layer, ManagedRuntime, Scope } from "effect"
import * as RpcTest from "@effect/rpc/RpcTest"
import { AppRpcGroup } from "@inkpipe/shared/rpc"
import { ConfigServiceLive } from "../layers/Config"
import { LogServiceLive } from "../layers/Log"
import { JobStoreServiceLive } from "../layers/JobStore"
import { FileManagerServiceLive } from "../layers/FileManager"
import { SettingsHandlersLive } from "./handlers/settings"
import { HealthHandlersLive } from "./handlers/health"

const NoDepLayer = Layer.mergeAll(
  LogServiceLive,
  ConfigServiceLive,
  JobStoreServiceLive,
  FileManagerServiceLive,
)

const RpcHandlerLayer = Layer.provide(
  Layer.mergeAll(SettingsHandlersLive, HealthHandlersLive),
  NoDepLayer,
)

type Client = Record<string, Record<string, (payload: unknown) => Effect.Effect<unknown, unknown>>>

export async function createRpcHandler(): Promise<(req: Request) => Promise<Response>> {
  const scope = Effect.runSync(Scope.make())
  const runtime = ManagedRuntime.make(RpcHandlerLayer)

  const client = await runtime.runPromise(
    RpcTest.makeClient(AppRpcGroup).pipe(Scope.extend(scope)),
  ) as unknown as Client

  return async (req: Request): Promise<Response> => {
    try {
      const body = await req.json() as {
        tag: string
        payload: unknown
      }
      const { tag, payload } = body

      const method = tag.includes(".") ? tag.split(".").pop()! : tag
      const prefix = tag.includes(".") ? tag.split(".").slice(0, -1).join(".") : ""

      let rpcTarget: Record<string, Function> = client as unknown as Record<string, Function>
      if (prefix) {
        rpcTarget = (client as unknown as Record<string, Record<string, Function>>)[prefix]
      }

      if (!rpcTarget || typeof rpcTarget[method] !== "function") {
        return Response.json({ error: `Unknown RPC: ${tag}` }, { status: 404 })
      }

      const effect = rpcTarget[method](payload)

      const result = await runtime.runPromise(
        effect as Effect.Effect<unknown, unknown>,
      )

      return Response.json({ result })
    } catch (e) {
      console.error("[rpc] Error:", e)
      return Response.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      )
    }
  }
}
