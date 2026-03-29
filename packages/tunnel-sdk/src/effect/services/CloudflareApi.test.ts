import { describe, it, assert } from "@effect/vitest"
import { Effect, Layer, Redacted, Stream } from "effect"
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/unstable/http"
import { TunnelApiError, TunnelAuthError } from "../errors.js"
import { CloudflareApi, CloudflareApiConfig } from "./CloudflareApi.js"

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const testConfig = new CloudflareApiConfig({
  accountId: "test-account-id",
  apiToken: Redacted.make("test-api-token"),
  baseUrl: "https://api.test.com/v4",
})

/** Build a mock HttpClient that returns canned responses based on request */
function mockHttpClient(
  handler: (
    request: HttpClientRequest.HttpClientRequest,
    url: URL,
  ) => Response,
) {
  const client = HttpClient.make((request, url) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, handler(request, url))),
  )
  return Layer.succeed(HttpClient.HttpClient, client)
}

/** Standard CF success response */
function cfSuccess<T>(result: T, resultInfo?: any): Response {
  return new Response(
    JSON.stringify({
      success: true,
      errors: [],
      messages: [],
      result,
      result_info: resultInfo,
    }),
  )
}

/** Standard CF error response */
function cfError(
  status: number,
  errors: Array<{ code: number; message: string }>,
): Response {
  return new Response(
    JSON.stringify({ success: false, errors, messages: [], result: null }),
    { status },
  )
}

/** Create a test layer with a mocked HTTP client */
function testLayer(
  handler: (
    request: HttpClientRequest.HttpClientRequest,
    url: URL,
  ) => Response,
) {
  return CloudflareApi.layer(testConfig).pipe(Layer.provide(mockHttpClient(handler)))
}

describe("CloudflareApi", () => {
  describe("get", () => {
    it.effect("extracts .result from CF response", () =>
      Effect.gen(function* () {
        const api = yield* CloudflareApi
        const result = yield* api.get<{ id: string; name: string }>("/test")
        assert.deepStrictEqual(result, { id: "123", name: "test" })
      }).pipe(
        Effect.provide(
          testLayer(() => cfSuccess({ id: "123", name: "test" })),
        ),
      ),
    )

    it.effect("passes query params", () => {
      let capturedUrl = ""
      return Effect.gen(function* () {
        const api = yield* CloudflareApi
        yield* api.get("/test", { status: "healthy", name: "my-app" })
        assert.isTrue(capturedUrl.includes("status=healthy"))
        assert.isTrue(capturedUrl.includes("name=my-app"))
      }).pipe(
        Effect.provide(
          testLayer((_req, url) => {
            capturedUrl = url.toString()
            return cfSuccess([])
          }),
        ),
      )
    })
  })

  describe("post", () => {
    it.effect("sends POST and extracts .result", () =>
      Effect.gen(function* () {
        const api = yield* CloudflareApi
        const result = yield* api.post<{ id: string }>("/tunnels", {
          name: "test-tunnel",
        })
        assert.deepStrictEqual(result, { id: "new-id" })
      }).pipe(
        Effect.provide(
          testLayer((req) => {
            // Verify method is POST
            assert.strictEqual(req.method, "POST")
            return cfSuccess({ id: "new-id" })
          }),
        ),
      ),
    )
  })

  describe("del", () => {
    it.effect("passes query params", () => {
      let capturedUrl = ""
      return Effect.gen(function* () {
        const api = yield* CloudflareApi
        yield* api.del("/test", { cascade: "true" })
        assert.isTrue(capturedUrl.includes("cascade=true"))
      }).pipe(
        Effect.provide(
          testLayer((_req, url) => {
            capturedUrl = url.toString()
            return cfSuccess(null)
          }),
        ),
      )
    })
  })

  describe("error handling", () => {
    it.effect("maps 401 to TunnelAuthError", () =>
      Effect.gen(function* () {
        const api = yield* CloudflareApi
        const result = yield* api.get("/test").pipe(
          Effect.catchTag("TunnelAuthError", (e) => Effect.succeed(e._tag)),
        )
        assert.strictEqual(result, "TunnelAuthError")
      }).pipe(
        Effect.provide(
          testLayer(() =>
            cfError(401, [{ code: 10000, message: "Invalid API token" }]),
          ),
        ),
      ),
    )

    it.effect("maps 403 to TunnelAuthError", () =>
      Effect.gen(function* () {
        const api = yield* CloudflareApi
        const result = yield* api.get("/test").pipe(
          Effect.catchTag("TunnelAuthError", (e) => Effect.succeed(e._tag)),
        )
        assert.strictEqual(result, "TunnelAuthError")
      }).pipe(
        Effect.provide(
          testLayer(() =>
            cfError(403, [{ code: 10000, message: "Forbidden" }]),
          ),
        ),
      ),
    )

    it.effect("maps other failures to TunnelApiError", () =>
      Effect.gen(function* () {
        const api = yield* CloudflareApi
        const result = yield* api.get("/test").pipe(
          Effect.catchTag("TunnelApiError", (e) =>
            Effect.succeed({ tag: e._tag, status: e.status }),
          ),
        )
        assert.deepStrictEqual(result, { tag: "TunnelApiError", status: 404 })
      }).pipe(
        Effect.provide(
          testLayer(() =>
            cfError(404, [{ code: 1003, message: "Tunnel not found" }]),
          ),
        ),
      ),
    )
  })

  describe("path builders", () => {
    it.effect("accountPath builds correct path", () =>
      Effect.gen(function* () {
        const api = yield* CloudflareApi
        assert.strictEqual(
          api.accountPath("/cfd_tunnel"),
          "/accounts/test-account-id/cfd_tunnel",
        )
      }).pipe(
        Effect.provide(testLayer(() => cfSuccess(null))),
      ),
    )

    it.effect("zonePath builds correct path", () =>
      Effect.gen(function* () {
        const api = yield* CloudflareApi
        assert.strictEqual(
          api.zonePath("zone-123", "/dns_records"),
          "/zones/zone-123/dns_records",
        )
      }).pipe(
        Effect.provide(testLayer(() => cfSuccess(null))),
      ),
    )
  })

  describe("paginate", () => {
    it.effect("auto-paginates through pages", () => {
      let callCount = 0
      return Effect.gen(function* () {
        const api = yield* CloudflareApi
        const items = yield* api
          .paginate<{ id: string }>("/test")
          .pipe(Stream.runCollect)

        const arr = Array.from(items)
        assert.strictEqual(arr.length, 3)
        assert.deepStrictEqual(arr, [
          { id: "1" },
          { id: "2" },
          { id: "3" },
        ])
        assert.strictEqual(callCount, 2)
      }).pipe(
        Effect.provide(
          testLayer((_req, url) => {
            callCount++
            const page = url.searchParams.get("page")
            if (page === "1") {
              return new Response(
                JSON.stringify({
                  success: true,
                  errors: [],
                  messages: [],
                  result: [{ id: "1" }, { id: "2" }],
                  result_info: {
                    page: 1,
                    per_page: 2,
                    total_pages: 2,
                    count: 2,
                    total_count: 3,
                  },
                }),
              )
            }
            return new Response(
              JSON.stringify({
                success: true,
                errors: [],
                messages: [],
                result: [{ id: "3" }],
                result_info: {
                  page: 2,
                  per_page: 2,
                  total_pages: 2,
                  count: 1,
                  total_count: 3,
                },
              }),
            )
          }),
        ),
      )
    })
  })
})
