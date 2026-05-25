# TanStack Start as sole server-side endpoint pattern

All API endpoints are implemented as TanStack Start `createServerFn` functions in `src/server/functions/`, replacing the previous Nitro-based handlers in `server/api/`. This ensures endpoints work consistently in both dev and production modes, since Nitro handlers were only active post-build.