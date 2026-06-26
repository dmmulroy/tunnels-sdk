import { describe, it, assert } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TunnelSdkError } from "../errors.js"
import { mockApi } from "./test-helpers.js"
import { VNetManager } from "./VNetManager.js"

const testLayer = (handlers: Parameters<typeof mockApi>[0]) =>
  VNetManager.layer.pipe(Layer.provide(mockApi(handlers)))

describe("VNetManager (Effect)", () => {
  it.effect("create returns mapped VNet", () =>
    Effect.gen(function* () {
      const mgr = yield* VNetManager
      const result = yield* mgr.create("production", { default: true, comment: "main" })
      assert.strictEqual(result.id, "vnet-1")
      assert.strictEqual(result.name, "production")
      assert.strictEqual(result.isDefault, true)
      assert.strictEqual(result.comment, "main")
    }).pipe(
      Effect.provide(testLayer({
        post: () => Effect.succeed({
          id: "vnet-1", name: "production", is_default_network: true,
          comment: "main", created_at: "2025-02-18T10:00:00Z", deleted_at: null,
        }),
      })),
    ),
  )

  it.effect("list maps CfVirtualNetwork to VNet", () =>
    Effect.gen(function* () {
      const mgr = yield* VNetManager
      const vnets = yield* mgr.list()
      assert.strictEqual(vnets.length, 2)
      assert.strictEqual(vnets[0].name, "production")
      assert.strictEqual(vnets[0].isDefault, true)
      assert.strictEqual(vnets[1].comment, undefined)
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed([
          { id: "v1", name: "production", is_default_network: true, comment: "prod", created_at: "2025-01-01", deleted_at: null },
          { id: "v2", name: "staging", is_default_network: false, created_at: "2025-01-01", deleted_at: null },
        ]),
      })),
    ),
  )

  it.effect("del finds by name then deletes", () => {
    let deletedPath = ""
    return Effect.gen(function* () {
      const mgr = yield* VNetManager
      yield* mgr.del("staging")
      assert.strictEqual(deletedPath, "/accounts/test-acct/teamnet/virtual_networks/v1")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed([
          { id: "v1", name: "staging", is_default_network: false, created_at: "2025-01-01", deleted_at: null },
        ]),
        del: (path) => { deletedPath = path; return Effect.succeed(null) },
      })),
    )
  })

  it.effect("del fails when vnet not found", () =>
    Effect.gen(function* () {
      const mgr = yield* VNetManager
      const msg = yield* mgr.del("nonexistent").pipe(
        Effect.catchTag("TunnelSdkError", (e) => Effect.succeed(e.message)),
      )
      assert.isTrue(typeof msg === "string" && msg.includes("virtual network"))
      assert.isTrue(typeof msg === "string" && msg.includes("help:"))
    }).pipe(
      Effect.provide(testLayer({ get: () => Effect.succeed([]) })),
    ),
  )
})
