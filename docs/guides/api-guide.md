# API Guide

This is the consolidated guide for API development in the Accountability project, covering Effect HttpApi patterns on the backend and the typed Foldkit client on the frontend.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Defining API Endpoints (Backend)](#defining-api-endpoints-backend)
3. [Request/Response Schemas](#requestresponse-schemas)
4. [Implementing Handlers](#implementing-handlers)
5. [Authentication & Middleware](#authentication--middleware)
6. [Typed Client (Frontend)](#typed-client-frontend)
7. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Architecture Overview

```
Frontend (Foldkit + HttpApiClient) → API (Effect HttpApi) → Service → Repository → Database
```

**Backend (Effect):**

- `HttpApi` - Define typed API contracts using Schema
- `HttpApiBuilder` - Implement handlers with full type safety
- Auto-generates OpenAPI spec

**Frontend (Foldkit):**

- `HttpApiClient` - Type-safe client derived from the same `InkpipeApi` definition
- Calls live in Foldkit Commands (`callApi`); results come back as Messages

---

## Defining API Endpoints (Backend)

### Use Domain Schemas Directly

HttpApi automatically decodes path params, URL params, headers, and payloads. Use domain schemas directly instead of raw strings:

```typescript
// GOOD: Use AccountId directly - automatic decoding
const getAccount = HttpApiEndpoint.get("getAccount", "/:id")
  .setPath(Schema.Struct({ id: AccountId })) // Branded type
  .addSuccess(Account)

  // Handler receives already-decoded AccountId
  .handle("getAccount", (_) =>
    Effect.gen(function* () {
      // _.path.id is already AccountId - no manual decoding!
      const account = yield* accountRepo.findById(_.path.id)
      // ...
    }),
  )

// BAD: Raw strings require manual decoding
const getAccount = HttpApiEndpoint.get("getAccount", "/:id")
  .setPath(Schema.Struct({ id: Schema.String })) // Raw string

  .handle("getAccount", (_) =>
    Effect.gen(function* () {
      // Manual decoding - this is a red flag!
      const accountId = yield* Schema.decodeUnknown(AccountId)(_.path.id)
      // ...
    }),
  )
```

### Creating API Groups

```typescript
// Define endpoints
const findById = HttpApiEndpoint.get("findById")`/accounts/${accountIdParam}`
  .addSuccess(Account)
  .addError(NotFoundError)

const create = HttpApiEndpoint.post("create", "/accounts")
  .setPayload(CreateAccountInput)
  .addSuccess(Account, { status: 201 })
  .addError(ValidationError)

const list = HttpApiEndpoint.get("list", "/accounts")
  .setUrlParams(
    Schema.Struct({
      companyId: CompanyId,
      page: Schema.optional(Schema.NumberFromString),
      limit: Schema.optional(Schema.NumberFromString),
    }),
  )
  .addSuccess(Schema.Array(Account))

// Group related endpoints
class AccountsApi extends HttpApiGroup.make("accounts")
  .add(findById)
  .add(create)
  .add(list)
  .prefix("/api/v1")
  .addError(UnauthorizedError, { status: 401 }) {}

// Compose into full API
class AppApi extends HttpApi.make("app")
  .add(AccountsApi)
  .add(CompaniesApi)
  .add(ReportsApi)
  .addError(InternalServerError, { status: 500 }) {}
```

---

## Request/Response Schemas

### Path Parameters

Path parameters are always strings. Use branded string schemas:

```typescript
export const AccountId = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f-]{36}$/),
  Schema.brand("AccountId"),
)

const getAccount = HttpApiEndpoint.get("getAccount", "/:id").setPath(
  Schema.Struct({ id: AccountId }),
)
```

### URL Query Parameters

Use transforming schemas for non-string types:

```typescript
export const AccountListParams = Schema.Struct({
  companyId: CompanyId, // Branded string
  accountType: Schema.optional(AccountType), // String literal union
  isActive: Schema.optional(Schema.BooleanFromString), // Transform to boolean
  limit: Schema.optional(
    Schema.NumberFromString.pipe(
      // Transform to number
      Schema.int(),
      Schema.greaterThan(0),
    ),
  ),
})
```

### Request Bodies

Use domain schemas directly for JSON payloads:

```typescript
export class CreateAccountRequest extends Schema.Class<CreateAccountRequest>(
  "CreateAccountRequest",
)({
  companyId: CompanyId,
  accountType: AccountType,
  parentAccountId: Schema.OptionFromNullOr(AccountId), // Option encoded as null
}) {}
```

### Response Bodies

Return domain entities directly:

```typescript
const getAccount = HttpApiEndpoint.get("getAccount", "/:id").addSuccess(Account) // Domain entity as response

// For lists with metadata
export class AccountListResponse extends Schema.Class<AccountListResponse>("AccountListResponse")({
  accounts: Schema.Array(Account),
  total: Schema.Number,
  limit: Schema.Number,
  offset: Schema.Number,
}) {}
```

### Error Responses

Annotate error schemas with HTTP status codes:

```typescript
class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()(
  "NotFoundError",
  { resource: Schema.String, id: Schema.String },
  HttpApiSchema.annotations({ status: 404 }),
) {}

class ValidationError extends Schema.TaggedErrorClass<ValidationError>()(
  "ValidationError",
  { errors: Schema.Array(Schema.String) },
  HttpApiSchema.annotations({ status: 422 }),
) {}

// Empty errors (status only, no body)
class UnauthorizedError extends HttpApiSchema.EmptyError<UnauthorizedError>()({
  tag: "UnauthorizedError",
  status: 401,
}) {}
```

---

## Implementing Handlers

```typescript
const AccountsLive = HttpApiBuilder.group(AppApi, "accounts", (handlers) =>
  handlers
    .handle("findById", ({ path }) =>
      Effect.gen(function* () {
        const service = yield* AccountService
        const account = yield* service.findById(path.accountId)
        return yield* Option.match(account, {
          onNone: () =>
            Effect.fail(
              new NotFoundError({
                resource: "Account",
                resourceId: path.accountId,
              }),
            ),
          onSome: Effect.succeed,
        })
      }),
    )
    .handle("create", ({ payload }) =>
      Effect.gen(function* () {
        const service = yield* AccountService
        return yield* service.create(payload)
      }),
    )
    .handle("list", ({ urlParams }) =>
      Effect.gen(function* () {
        const service = yield* AccountService
        // urlParams are already decoded
        return yield* service.list({
          companyId: urlParams.companyId,
          page: urlParams.page ?? 1,
          limit: urlParams.limit ?? 20,
        })
      }),
    ),
).pipe(Layer.provide(AccountServiceLive))

// Compose all implementations
const ApiLive = HttpApiBuilder.api(AppApi).pipe(
  Layer.provide([AccountsLive, CompaniesLive, ReportsLive]),
)
```

---

## Authentication & Middleware

### Cookie-Based Authentication

```typescript
class AuthMiddleware extends HttpApiMiddleware.Tag<AuthMiddleware>()("AuthMiddleware", {
  failure: UnauthorizedError,
  provides: CurrentUser,
  security: {
    cookie: HttpApiSecurity.apiKey({
      key: "session",
      in: "cookie",
    }),
  },
}) {}

const AuthMiddlewareLive = Layer.succeed(
  AuthMiddleware,
  AuthMiddleware.of({
    cookie: (token) =>
      Effect.gen(function* () {
        const authService = yield* AuthService
        const user = yield* authService.validateSession(token)
        return user
      }),
  }),
)

// Apply to group
class SecureApi extends HttpApiGroup.make("secure")
  .add(protectedEndpoint)
  .middleware(AuthMiddleware) {}
```

### Setting Cookies in Responses

```typescript
// In login handler
HttpServerResponse.setCookie("session", token, {
  httpOnly: true, // Not accessible via JavaScript
  secure: true, // HTTPS only
  sameSite: "strict", // CSRF protection
})
```

---

## Typed Client (Frontend)

The web app (Foldkit) builds a typed client straight from the shared `InkpipeApi` definition, so there is no code generation step:

```typescript
// packages/web/app/api.ts
HttpApiClient.make(InkpipeApi, { baseUrl })
```

Commands call it through `callApi`, which folds every failure (typed API error, transport error, decode error) into one `ApiFailure`:

```typescript
export const FetchWatches = Command.define("FetchWatches", {
  args: { seq: Schema.Int },
  messages: [Message.SucceededFetchWatches, Message.FailedFetchWatches],
  execute: ({ seq }) =>
    callApi((client) => client.watches.list()).pipe(
      Effect.match({
        onSuccess: ({ watches }) => Message.SucceededFetchWatches({ seq, watches }),
        onFailure: ({ message }) => Message.FailedFetchWatches({ seq, reason: message }),
      }),
    ),
})
```

Rules:

- Endpoints, payloads and errors are defined once in `packages/shared/src/httpApi`; the client follows automatically.
- Commands never throw: failures become Messages, so `update` decides what the user sees.
- Tag each request with a sequence number (or the entity id) and ignore answers that no longer match, so a slow response can't overwrite newer state.
- Tests stub `HttpClient` (see `watches.test.ts`) and assert on the Message a Command produces.
- The Debug page is the one place that uses raw `fetch`, on purpose.

---

## Anti-Patterns to Avoid

### DO NOT Use Raw fetch()

```typescript
// WRONG - bypasses type safety
const response = await fetch("/api/v1/organizations")
const data = await response.json()

// CORRECT - use typed client
const { data, error } = await api.GET("/api/v1/organizations")
```

### DO NOT Store Tokens in localStorage

```typescript
// WRONG - vulnerable to XSS
localStorage.setItem("token", response.token)
headers: {
  Authorization: `Bearer ${localStorage.getItem("token")}`
}

// CORRECT - server sets httpOnly cookie, browser sends automatically
await api.POST("/api/auth/login", { body: { email, password } })
```

### DO NOT Return Tokens in Response Body

```typescript
// WRONG - token can be stolen by XSS
return { token: sessionToken, user: { ... } }

// CORRECT - set token in httpOnly cookie only
HttpServerResponse.setCookie("session", token, {
  httpOnly: true,
  secure: true,
  sameSite: "strict"
})
return { user: { id, email, displayName } }
```

### DO NOT Manually Decode in Handlers

```typescript
// WRONG - manual decoding in handler
.handle("getAccount", (_) =>
  Effect.gen(function* () {
    const accountId = yield* Schema.decodeUnknown(AccountId)(_.path.id)
    // ...
  })
)

// CORRECT - use domain schema in endpoint definition
.setPath(Schema.Struct({ id: AccountId }))  // Auto-decodes

.handle("getAccount", (_) =>
  Effect.gen(function* () {
    // _.path.id is already AccountId
    const account = yield* repo.findById(_.path.id)
  })
)
```

---

## API Definition Checklist

1. **Path params**: Use branded string schemas (`AccountId`, `CompanyId`)
2. **Query params**: Use branded strings + transforming schemas (`BooleanFromString`, `NumberFromString`)
3. **Request body**: Use domain schemas with `OptionFromNullOr` for optional fields
4. **Response body**: Return domain entities or wrap in response classes
5. **Errors**: Annotate with HTTP status codes
6. **No manual decoding**: If calling `Schema.decode*` in a handler, reconsider the API schema
