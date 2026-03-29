{
  "id": "3f1ffd3f",
  "title": "Effect refactor: CloudflareApi service (effect/services/CloudflareApi.ts)",
  "tags": [
    "effect-refactor",
    "service"
  ],
  "status": "open",
  "created_at": "2026-03-29T02:47:25.877Z"
}

## Goal

Implement the `CloudflareApi` service — the authenticated HTTP client for the Cloudflare API. This is the core dependency that every other service builds on. It replaces `packages/tunnel-sdk/src/api/client.ts` and `packages/tunnel-sdk/src/api/interfaces.ts`.

## Context

The current `ApiClient` class (~120 lines) wraps `fetch` with:
- Bearer token auth header
- JSON request/response handling
- URL building with base URL + query params
- Error mapping (401/403 → `TunnelAuthError`, other → `TunnelApiError`)
- Pagination via `AsyncGenerator`

The Effect version uses `HttpClient` from `effect/unstable/http` which gives us `retryTransient`, `filterStatusOk`, `schemaBodyJson`, and injectable transport for free.

## What to create

### File: `packages/tunnel-sdk/src/effect/services/CloudflareApi.ts`

```ts
import { Config, Effect, Layer, Redacted, Schema, ServiceMap, Schedule, Stream } from "effect"
import { flow } from "effect/Function"
import * as Option from "effect/Option"
import { HttpClient, HttpClientRequest, HttpClientResponse, FetchHttpClient } from "effect/unstable/http"
import { TunnelApiError, TunnelAuthError } from "../errors.js"
```

**Config schema** — `CloudflareApiConfig`:
```ts
export class CloudflareApiConfig extends Schema.Class<CloudflareApiConfig>("CloudflareApiConfig")({
  accountId: Schema.NonEmptyString,
  apiToken: Schema.Redacted(Schema.NonEmptyString),
  baseUrl: Schema.optionalWith(Schema.String, {
    default: () => "https://api.cloudflare.com/client/v4",
  }),
}) {}
```

**Service interface**:
```ts
export class CloudflareApi extends ServiceMap.Service<CloudflareApi, {
  get<T>(path: string, params?: Record<string, string>): Effect.Effect<T, TunnelApiError | TunnelAuthError>
  post<T>(path: string, body?: unknown): Effect.Effect<T, TunnelApiError | TunnelAuthError>
  put<T>(path: string, body?: unknown): Effect.Effect<T, TunnelApiError | TunnelAuthError>
  delete<T>(path: string, params?: Record<string, string>): Effect.Effect<T, TunnelApiError | TunnelAuthError>
  paginate<T>(path: string, params?: Record<string, string>): Stream.Stream<T, TunnelApiError | TunnelAuthError>
  accountPath(path: string): string
  zonePath(zoneId: string, path: string): string
}>()(
  "tunnel-sdk/CloudflareApi"
)
```

**Implementation details**:

1. In the layer constructor, `yield* HttpClient.HttpClient` to get the injectable client
2. Pipe it through:
   - `HttpClient.mapRequest(flow(prependUrl(baseUrl), setHeader("Authorization", ...), acceptJson))`
   - `HttpClient.filterStatusOk`
   - `HttpClient.retryTransient({ schedule: Schedule.exponential("250 millis"), times: 3 })`
3. The CF API wraps all responses in `{ success: boolean, errors: [...], result: T, result_info?: {...} }`
4. For `get/post/put/delete`: make the request, parse response JSON, check `success`, extract `result`
5. Error mapping: use `HttpClientResponse.matchStatus` or catch HttpClientError and inspect status:
   - 401/403 → `new TunnelAuthError()`
   - Other non-2xx → `new TunnelApiError({ status, errors: data.errors })`
6. For `paginate`: return `Stream.paginate(1, ...)` — fetch page N, yield items, return `Option.some(N+1)` if more pages exist based on `result_info.total_pages`
7. `accountPath(path)` → `` `/accounts/${config.accountId}${path}` ``
8. `zonePath(zoneId, path)` → `` `/zones/${zoneId}${path}` ``

**Three layer constructors** (see EFFECT_REFACTOR_PLAN.md "CloudflareApi" section):
- `static layer(config: CloudflareApiConfig)` — needs `HttpClient` requirement
- `static layerLive(config: CloudflareApiConfig)` — self-contained, provides `FetchHttpClient.layer`
- `static layerFromEnv` — reads `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_BASE_URL` via `Config`

### Test: `packages/tunnel-sdk/src/effect/services/CloudflareApi.test.ts`

Test through the service interface. Mock `HttpClient` at the boundary — provide a test layer instead of `FetchHttpClient.layer`.

**How to mock HttpClient**: Create a `Layer.succeed(HttpClient.HttpClient, ...)` that returns canned responses. See `.dependencies/effect-smol/ai-docs/src/50_http-client/10_basics.ts` for the client shape.

Key test behaviors:
1. `get` extracts `.result` from a successful CF API response
2. `get` with params appends query string
3. `post` sends JSON body, extracts `.result`
4. 401 response maps to `TunnelAuthError`
5. 403 response maps to `TunnelAuthError`
6. Non-2xx with `success: false` maps to `TunnelApiError` with status + errors
7. `accountPath` builds correct path
8. `zonePath` builds correct path
9. `paginate` yields items across multiple pages
10. `paginate` stops when `page >= total_pages`

## Files to read first

- `packages/tunnel-sdk/src/api/client.ts` — current implementation (source of truth for behavior)
- `packages/tunnel-sdk/src/api/interfaces.ts` — current interface
- `packages/tunnel-sdk/src/api/client.test.ts` — existing tests to port
- `packages/tunnel-sdk/src/effect/errors.ts` — error types this service uses
- `.dependencies/effect-smol/ai-docs/src/50_http-client/10_basics.ts` — HttpClient patterns
- `.dependencies/effect-smol/LLMS.md` — "Writing Effect services" section, ServiceMap.Service pattern

## Effect patterns reference

```ts
// HttpClient setup
const baseClient = (yield* HttpClient.HttpClient).pipe(
  HttpClient.mapRequest(flow(
    HttpClientRequest.prependUrl("https://api.cloudflare.com/client/v4"),
    HttpClientRequest.setHeader("Authorization", `Bearer ${token}`),
    HttpClientRequest.acceptJson,
  )),
  HttpClient.filterStatusOk,
  HttpClient.retryTransient({ schedule: Schedule.exponential("250 millis"), times: 3 }),
)

// Making a GET request and decoding
const result = yield* baseClient.get(url, { urlParams: params }).pipe(
  Effect.flatMap((response) => response.json),
  Effect.map((data) => data.result),
  Effect.mapError(mapToSdkError),
)

// Stream.paginate for pagination
Stream.paginate(1, Effect.fn(function*(page) {
  const data = yield* fetchPage(page)
  const nextPage = page < data.result_info.total_pages
    ? Option.some(page + 1)
    : Option.none()
  return [data.result, nextPage] as const
}))
```

## Acceptance criteria

- [ ] `CloudflareApiConfig` uses `Schema.Redacted` for API token
- [ ] Service implements all 7 interface methods
- [ ] `retryTransient` is configured with exponential backoff
- [ ] `filterStatusOk` is applied to the client
- [ ] 401/403 → `TunnelAuthError`, other errors → `TunnelApiError`
- [ ] `paginate` returns `Stream.Stream` using `Stream.paginate`
- [ ] Three layer constructors work: `layer`, `layerLive`, `layerFromEnv`
- [ ] Tests mock HttpClient at the boundary (not internal fetch)
- [ ] All existing `client.test.ts` behaviors are ported
- [ ] `pnpm typecheck` and `pnpm test` pass

## Dependencies

- Requires: TODO-9c25b94b (errors.ts)
- Requires: TODO-49756c12 (effect + @effect/platform-node installed)
