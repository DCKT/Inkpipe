import ky from "ky"

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : ""

const rpcClient = ky.create({ prefixUrl: `${API_BASE}/api/rpc`, timeout: 30000 })

export async function rpc<T>(tag: string, payload?: unknown): Promise<T> {
  const data = await rpcClient
    .post("", { json: { tag, payload: payload ?? null } })
    .json<{ result: T } | { error: string }>()

  if ("error" in data) throw new Error(data.error)
  return (data as { result: T }).result
}
