import { Effect, Layer, Stream } from "effect"
import { CloudflareApi } from "./CloudflareApi.js"

/** Create a mock CloudflareApi layer for testing manager services */
export function mockApi(handlers: {
  get?: (path: string, params?: Record<string, string>) => Effect.Effect<any, any>
  post?: (path: string, body?: unknown) => Effect.Effect<any, any>
  put?: (path: string, body?: unknown) => Effect.Effect<any, any>
  del?: (path: string, params?: Record<string, string>) => Effect.Effect<any, any>
  paginate?: (path: string, params?: Record<string, string>) => Stream.Stream<any, any>
}) {
  return Layer.succeed(
    CloudflareApi,
    CloudflareApi.of({
      get: (path, params) =>
        handlers.get?.(path, params) ?? Effect.succeed([]),
      post: (path, body) =>
        handlers.post?.(path, body) ?? Effect.succeed({}),
      put: (path, body) =>
        handlers.put?.(path, body) ?? Effect.succeed({}),
      del: (path, params) =>
        handlers.del?.(path, params) ?? Effect.succeed(null),
      paginate: (path, params) =>
        handlers.paginate?.(path, params) ?? Stream.empty,
      accountPath: (path) => `/accounts/test-acct${path}`,
      zonePath: (zoneId, path) => `/zones/${zoneId}${path}`,
    }),
  )
}
