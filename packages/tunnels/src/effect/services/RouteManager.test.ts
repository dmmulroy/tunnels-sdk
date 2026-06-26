import { describe, it, assert } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TunnelApiError, TunnelSdkError } from "../errors.js"
import { mockApi } from "./test-helpers.js"
import { RouteManager } from "./RouteManager.js"

const testLayer = (handlers: Parameters<typeof mockApi>[0]) =>
  RouteManager.layer.pipe(Layer.provide(mockApi(handlers)))

const cfRoutes = [
  {
    id: "r1", network: "10.0.0.0/8", tunnel_id: "tunnel-1",
    tunnel_name: "my-tunnel", virtual_network_id: "vnet-1",
    comment: "main", created_at: "2025-01-01", deleted_at: null,
  },
]

describe("RouteManager (Effect)", () => {
  it.effect("list maps CfRoute to Route", () =>
    Effect.gen(function* () {
      const mgr = yield* RouteManager
      const routes = yield* mgr.list("tunnel-1")
      assert.strictEqual(routes.length, 1)
      assert.strictEqual(routes[0].network, "10.0.0.0/8")
      assert.strictEqual(routes[0].tunnelId, "tunnel-1")
      assert.strictEqual(routes[0].vnet, "vnet-1")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed(cfRoutes),
      })),
    ),
  )

  it.effect("add posts route body", () => {
    let postedBody: any = null
    return Effect.gen(function* () {
      const mgr = yield* RouteManager
      yield* mgr.add("tunnel-1", "10.0.0.0/8", { comment: "test" })
      assert.strictEqual(postedBody.network, "10.0.0.0/8")
      assert.strictEqual(postedBody.tunnel_id, "tunnel-1")
      assert.strictEqual(postedBody.comment, "test")
    }).pipe(
      Effect.provide(testLayer({
        post: (_path, body) => { postedBody = body; return Effect.succeed({}) },
      })),
    )
  })

  it.effect("add resolves vnet name to ID", () => {
    let postedBody: any = null
    return Effect.gen(function* () {
      const mgr = yield* RouteManager
      yield* mgr.add("tunnel-1", "10.0.0.0/8", { vnet: "production" })
      assert.strictEqual(postedBody.virtual_network_id, "vnet-1")
    }).pipe(
      Effect.provide(testLayer({
        get: (path) =>
          path.includes("virtual_networks")
            ? Effect.succeed([{ id: "vnet-1", name: "production" }])
            : Effect.succeed(cfRoutes),
        post: (_path, body) => { postedBody = body; return Effect.succeed({}) },
      })),
    )
  })

  it.effect("remove deletes by network", () => {
    let deletedPath = ""
    return Effect.gen(function* () {
      const mgr = yield* RouteManager
      yield* mgr.remove("tunnel-1", "10.0.0.0/8")
      assert.isTrue(deletedPath.includes("10.0.0.0%2F8"))
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed(cfRoutes),
        del: (path) => { deletedPath = path; return Effect.succeed(null) },
      })),
    )
  })

  it.effect("remove fails when route not found", () =>
    Effect.gen(function* () {
      const mgr = yield* RouteManager
      const msg = yield* mgr
        .remove("tunnel-1", "192.168.0.0/16")
        .pipe(Effect.catchTag("TunnelSdkError", (e) => Effect.succeed(e.message)))
      assert.isTrue(typeof msg === "string" && msg.includes("no private route found"))
      assert.isTrue(typeof msg === "string" && msg.includes("help:"))
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed(cfRoutes),
      })),
    ),
  )

  it.effect("check returns result for matching IP", () =>
    Effect.gen(function* () {
      const mgr = yield* RouteManager
      const result = yield* mgr.check("10.0.0.1")
      assert.isNotNull(result)
      assert.strictEqual(result!.tunnel, "my-tunnel")
      assert.strictEqual(result!.route, "10.0.0.0/8")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed({
          tunnel_id: "tunnel-1", tunnel_name: "my-tunnel",
          network: "10.0.0.0/8", virtual_network_id: "vnet-1",
        }),
      })),
    ),
  )

  it.effect("check returns null on 404", () =>
    Effect.gen(function* () {
      const mgr = yield* RouteManager
      const result = yield* mgr.check("192.168.0.1")
      assert.isNull(result)
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.fail(new TunnelApiError({ status: 404, errors: [] })),
      })),
    ),
  )
})
