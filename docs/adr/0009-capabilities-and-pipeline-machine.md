# ADR 0009: Capabilities and a pipeline state machine

## Context

Every API route was declared twice: an `HttpApiGroup` in `shared` and an `HttpApiBuilder.group` handler in `server`. Nothing else could reuse a route, so an agent or CLI would have needed a third copy. The download pipeline advanced its stage with sequential `updateJob` calls and a hand-written `while (true)` poll loop on a real `setTimeout`, which tests could not drive.

## Decision

Adopt two ideas from rat-stack (https://ratstack.sh), vendored rather than depended on because the packages are not published:

- **Capabilities** (`packages/capability`): one `defineContract` (input, output, failure as Effect schemas, plus HTTP route and annotations) and one `implement` handler per action. `toHttpApi` serves routes and OpenAPI, `toHttpClient` is a contracts-only client for the browser, and `toToolkit` serves the same list as an MCP server at `/mcp` when `INKPIPE_MCP=true` and `INKPIPE_MCP_TOKEN` is set (bearer auth).
- **A lifecycle machine** (`layers/pipeline/PipelineMachine.ts`): XState 6 with `@xstate/effect`. The machine owns stage transitions and the 3 second poll cadence (`after`, driven by Effect's `Clock`). Effect owns the work, typed errors and services. `Pipeline.ts` only creates the job and runs the machine.

Also adopted: oxlint with the `@effect/tsgo` presets, oxfmt, lefthook and a CI format/lint gate. Effect moved from `4.0.0-rc.111` to stable `4.0.1`, which dropped the `effect/unstable/*` import paths.

Not adopted: Alchemy and Cloudflare (inkpipe is self-hosted Docker and shells out to KCC), pnpm, Turborepo, code mode.

## Alternatives considered

- **Keep hand-written groups**: no duplication reduction, no new surfaces.
- **Depend on rat-stack directly**: its packages are private and unpublished.
- **Model every flow as a machine**: the Anna's Archive pipeline and watch triggers are linear, so they stay direct Effects.

## Consequences

- A new route is one contract and one handler; the web app calls it by name through `runCapability`.
- `convert` (multipart, SSE, binary) stays outside the registry as plain router routes, like the job WebSocket. Settings export/import were removed: they duplicated get/update, which the web app now uses.
- One OpenAPI document, `/openapi.json`, with Swagger at `/docs`; it covers capabilities only, not convert.
- DELETE inputs moved from a JSON body to the query string.
- `runPipeline` now fails with `PipelineError` when the job ends FAILED (it used to succeed), so the Telegram listener no longer reports a failed download as complete.
- The convert `id` must be a UUID; the old route used it unvalidated in a filesystem path.
- `xstate` and `@xstate/effect` are pre-release (`6.0.0-alpha.63`, `0.1.0-alpha.6`); pin them and expect churn.
- MCP is off by default and needs a bearer token (`INKPIPE_MCP_TOKEN`, 16+ characters) because inkpipe has no accounts and the toolkit includes settings and deletions. Without the token the server logs a warning and does not mount `/mcp`.
