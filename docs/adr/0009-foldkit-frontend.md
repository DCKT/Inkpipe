# ADR 0009: Foldkit for the web frontend

**Status: Accepted. Supersedes [ADR 0003](0003-ark-ui.md).**

## Context

The frontend was a React SPA (React Router, TanStack Query, Ark UI, ky) while the rest of the project (server, watcher, shared) is Effect. That meant two mental models, hand-written API types on the client, and server-state caching rules (query keys, invalidation) spread over components.

## Decision

Rewrite `packages/web` on **Foldkit** (Elm architecture on Effect, v0.170) with `@foldkit/ui` for accessible primitives, built with Vite and Tailwind v4.

- **One state tree.** Root `Model` holds a Submodel per page; `update` is pure; effects are `Command`s, `Mount`s and `Subscription`s.
- **Typed client.** The browser builds `HttpApiClient` from the shared `InkpipeApi`, so endpoints, payloads and errors are shared with the server. `callApi` folds every failure into one `ApiFailure`.
- **Explicit data lifecycle.** `AsyncData` (Idle / Loading / Refreshing / Failure / Stale / Success) replaces query caches; sequence numbers or ids guard stale answers.
- **Page → root via OutMessages** (toasts, sidebar refresh, navigation).
- **Tests are first-class.** Story tests (`update`), Scene tests (`view`), stubbed `HttpClient` tests (Commands), `TestClock` (subscriptions); every task was adversarially reviewed.

## Consequences

- No React, TanStack, Ark UI or ky in the repo. The frontend is Effect end to end.
- Foldkit is young: its source is vendored read-only at `repos/foldkit` as the reference, and its API may change between versions.
- Features that span layers still update shared schemas, server and web together.
