import { describe, it, assert } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { TunnelNotFoundError } from "../errors.js"
import { IngressRule } from "../schemas.js"
import { mockApi } from "./test-helpers.js"
import { DnsManager } from "./DnsManager.js"
import { IngressManager } from "./IngressManager.js"
import { RouteManager } from "./RouteManager.js"
import { TunnelOperations } from "./TunnelOperations.js"

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseCfTunnel = {
  id: "t-1",
  name: "my-tunnel",
  status: "inactive",
  created_at: "2025-02-18T10:00:00Z",
  deleted_at: null,
  remote_config: true,
  connections: [],
}

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------

function mockIngress(handlers: {
  set?: (tunnelId: string, rules: any) => Effect.Effect<void, any>
} = {}) {
  return Layer.succeed(
    IngressManager,
    IngressManager.of({
      list: () => Effect.succeed([]),
      add: () => Effect.succeed(void 0),
      remove: () => Effect.succeed(void 0),
      set: handlers.set ?? (() => Effect.succeed(void 0)),
    }),
  )
}

function mockDns(handlers: {
  ensure?: (tunnelId: string, hostname: string) => Effect.Effect<void, any>
  list?: (tunnelId: string) => Effect.Effect<any, any>
  remove?: (tunnelId: string, hostname: string) => Effect.Effect<void, any>
} = {}) {
  return Layer.succeed(
    DnsManager,
    DnsManager.of({
      ensure: handlers.ensure ?? (() => Effect.succeed(void 0)),
      remove: handlers.remove ?? (() => Effect.succeed(void 0)),
      list: handlers.list ?? (() => Effect.succeed([])),
    }),
  )
}

function mockRoutes(handlers: {
  add?: (tunnelId: string, network: string, options: any) => Effect.Effect<void, any>
} = {}) {
  return Layer.succeed(
    RouteManager,
    RouteManager.of({
      add: handlers.add ?? (() => Effect.succeed(void 0)),
      remove: () => Effect.succeed(void 0),
      list: () => Effect.succeed([]),
      check: () => Effect.succeed(null),
    }),
  )
}

function testLayer(
  apiHandlers: Parameters<typeof mockApi>[0],
  opts?: {
    ingress?: Parameters<typeof mockIngress>[0]
    dns?: Parameters<typeof mockDns>[0]
    routes?: Parameters<typeof mockRoutes>[0]
  },
) {
  return TunnelOperations.layer.pipe(
    Layer.provide(mockApi(apiHandlers)),
    Layer.provide(mockIngress(opts?.ingress)),
    Layer.provide(mockDns(opts?.dns)),
    Layer.provide(mockRoutes(opts?.routes)),
  )
}

describe("TunnelOperations (Effect)", () => {
  it.effect("create returns TunnelInfo", () =>
    Effect.gen(function* () {
      const ops = yield* TunnelOperations
      const info = yield* ops.create("my-tunnel")
      assert.strictEqual(info.id, "t-1")
      assert.strictEqual(info.name, "my-tunnel")
      assert.strictEqual(info.status, "inactive")
    }).pipe(
      Effect.provide(testLayer({
        post: () => Effect.succeed(baseCfTunnel),
      })),
    ),
  )

  it.effect("create sets ingress when provided", () => {
    let ingressSetCalled = false
    return Effect.gen(function* () {
      const ops = yield* TunnelOperations
      yield* ops.create("my-tunnel", {
        ingress: [new IngressRule({ hostname: "app.example.com", service: "http://localhost:3000" })],
      })
      assert.isTrue(ingressSetCalled)
    }).pipe(
      Effect.provide(testLayer(
        { post: () => Effect.succeed(baseCfTunnel) },
        { ingress: { set: () => { ingressSetCalled = true; return Effect.succeed(void 0) } } },
      )),
    )
  })

  it.effect("create ensures DNS when auto is true", () => {
    let ensuredHostnames: string[] = []
    return Effect.gen(function* () {
      const ops = yield* TunnelOperations
      yield* ops.create("my-tunnel", {
        ingress: [new IngressRule({ hostname: "app.example.com", service: "http://localhost:3000" })],
        dns: { auto: true },
      })
      assert.deepStrictEqual(ensuredHostnames, ["app.example.com"])
    }).pipe(
      Effect.provide(testLayer(
        { post: () => Effect.succeed(baseCfTunnel) },
        { dns: { ensure: (_tid, hostname) => { ensuredHostnames.push(hostname); return Effect.succeed(void 0) } } },
      )),
    )
  })

  it.effect("create adds routes when provided", () => {
    let addedRoutes: string[] = []
    return Effect.gen(function* () {
      const ops = yield* TunnelOperations
      yield* ops.create("my-tunnel", {
        routes: [{ network: "10.0.0.0/8", vnet: "prod" }],
      })
      assert.deepStrictEqual(addedRoutes, ["10.0.0.0/8"])
    }).pipe(
      Effect.provide(testLayer(
        { post: () => Effect.succeed(baseCfTunnel) },
        { routes: { add: (_tid, network) => { addedRoutes.push(network); return Effect.succeed(void 0) } } },
      )),
    )
  })

  it.effect("list returns TunnelInfo array", () =>
    Effect.gen(function* () {
      const ops = yield* TunnelOperations
      const tunnels = yield* ops.list()
      assert.strictEqual(tunnels.length, 1)
      assert.strictEqual(tunnels[0].name, "my-tunnel")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed([baseCfTunnel]),
      })),
    ),
  )

  it.effect("list fails if both name and search provided", () =>
    Effect.gen(function* () {
      const ops = yield* TunnelOperations
      const msg = yield* ops.list({ name: "a", search: "b" }).pipe(
        Effect.catchTag("TunnelSdkError", (e) => Effect.succeed(e.message)),
      )
      assert.isTrue(typeof msg === "string" && msg.includes("not both"))
    }).pipe(
      Effect.provide(testLayer({})),
    ),
  )

  it.effect("get by UUID fetches directly", () =>
    Effect.gen(function* () {
      const ops = yield* TunnelOperations
      const info = yield* ops.get("12345678-1234-1234-1234-123456789012")
      assert.strictEqual(info.id, "12345678-1234-1234-1234-123456789012")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed({ ...baseCfTunnel, id: "12345678-1234-1234-1234-123456789012" }),
      })),
    ),
  )

  it.effect("get by name searches then matches", () =>
    Effect.gen(function* () {
      const ops = yield* TunnelOperations
      const info = yield* ops.get("my-tunnel")
      assert.strictEqual(info.name, "my-tunnel")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed([baseCfTunnel]),
      })),
    ),
  )

  it.effect("get by name throws TunnelNotFoundError", () =>
    Effect.gen(function* () {
      const ops = yield* TunnelOperations
      const ref = yield* ops.get("nonexistent").pipe(
        Effect.catchTag("TunnelNotFoundError", (e) => Effect.succeed(e.tunnelRef)),
      )
      assert.strictEqual(ref, "nonexistent")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed([]),
      })),
    ),
  )

  it.effect("delete with cleanupDns removes DNS first", () => {
    let removedHostnames: string[] = []
    return Effect.gen(function* () {
      const ops = yield* TunnelOperations
      yield* ops.del("12345678-1234-1234-1234-123456789012", { cleanupDns: true })
      assert.deepStrictEqual(removedHostnames, ["app.example.com"])
    }).pipe(
      Effect.provide(testLayer(
        {
          get: () => Effect.succeed(baseCfTunnel),
          del: () => Effect.succeed(null),
        },
        {
          dns: {
            list: () => Effect.succeed([{ hostname: "app.example.com", type: "CNAME", content: "t-1.cfargotunnel.com" }]),
            remove: (_tid, hostname) => { removedHostnames.push(hostname); return Effect.succeed(void 0) },
          },
        },
      )),
    )
  })

  it.effect("getToken returns token string", () =>
    Effect.gen(function* () {
      const ops = yield* TunnelOperations
      const token = yield* ops.getToken("t-1")
      assert.strictEqual(token, "my-token-value")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed("my-token-value"),
      })),
    ),
  )

  it.effect("refresh re-fetches tunnel data", () =>
    Effect.gen(function* () {
      const ops = yield* TunnelOperations
      const info = yield* ops.refresh("t-1")
      assert.strictEqual(info.id, "t-1")
      assert.strictEqual(info.status, "healthy")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed({ ...baseCfTunnel, status: "healthy" }),
      })),
    ),
  )
})
