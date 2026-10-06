import { copypartyCapabilities } from "./copyparty"

// Every capability the server exposes. Projections (HTTP today; CLI and MCP later) derive from this list.
export const capabilities = [...copypartyCapabilities] as const
