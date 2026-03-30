import { describe, it, assert } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { TunnelSdkError } from "../errors.js"
import { IngressRule } from "../schemas.js"
import { mockApi } from "./test-helpers.js"
import { IngressManager } from "./IngressManager.js"

const cfConfig = (ingress: any[]) => ({
  config: { ingress },
})

const testLayer = (handlers: Parameters<typeof mockApi>[0]) =>
  IngressManager.layer.pipe(Layer.provide(mockApi(handlers)))

describe("IngressManager (Effect)", () => {
  it.effect("list returns mapped ingress rules", () =>
    Effect.gen(function* () {
      const mgr = yield* IngressManager
      const rules = yield* mgr.list("tunnel-1")
      assert.strictEqual(rules.length, 2)
      assert.strictEqual(rules[0].hostname, "app.example.com")
      assert.strictEqual(rules[1].service, "http_status:404")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed(cfConfig([
          { hostname: "app.example.com", service: "http://localhost:3000" },
          { service: "http_status:404" },
        ])),
      })),
    ),
  )

  it.effect("add inserts before catch-all", () => {
    let putBody: any = null
    return Effect.gen(function* () {
      const mgr = yield* IngressManager
      yield* mgr.add("tunnel-1", new IngressRule({
        hostname: "api.example.com",
        service: "http://localhost:8080",
      }))
      // Verify the new rule is before the catch-all
      const ingress = putBody?.config?.ingress
      assert.strictEqual(ingress.length, 3)
      assert.strictEqual(ingress[1].hostname, "api.example.com")
      assert.strictEqual(ingress[2].service, "http_status:404")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed(cfConfig([
          { hostname: "app.example.com", service: "http://localhost:3000" },
          { service: "http_status:404" },
        ])),
        put: (_path, body) => { putBody = body; return Effect.succeed({}) },
      })),
    )
  })

  it.effect("add rejects duplicate hostnames", () =>
    Effect.gen(function* () {
      const mgr = yield* IngressManager
      const msg = yield* mgr
        .add("tunnel-1", new IngressRule({
          hostname: "app.example.com",
          service: "http://localhost:9999",
        }))
        .pipe(Effect.catchTag("TunnelSdkError", (e) => Effect.succeed(e.message)))
      assert.isTrue(typeof msg === "string" && msg.includes("Duplicate hostname"))
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed(cfConfig([
          { hostname: "app.example.com", service: "http://localhost:3000" },
          { service: "http_status:404" },
        ])),
      })),
    ),
  )

  it.effect("remove filters out rule by hostname", () => {
    let putBody: any = null
    return Effect.gen(function* () {
      const mgr = yield* IngressManager
      yield* mgr.remove("tunnel-1", "app.example.com")
      const ingress = putBody?.config?.ingress
      assert.strictEqual(ingress.length, 1)
      assert.strictEqual(ingress[0].service, "http_status:404")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed(cfConfig([
          { hostname: "app.example.com", service: "http://localhost:3000" },
          { service: "http_status:404" },
        ])),
        put: (_path, body) => { putBody = body; return Effect.succeed({}) },
      })),
    )
  })

  it.effect("remove fails when hostname not found", () =>
    Effect.gen(function* () {
      const mgr = yield* IngressManager
      const msg = yield* mgr
        .remove("tunnel-1", "nonexistent.example.com")
        .pipe(Effect.catchTag("TunnelSdkError", (e) => Effect.succeed(e.message)))
      assert.isTrue(typeof msg === "string" && msg.includes("No ingress rule found"))
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed(cfConfig([
          { service: "http_status:404" },
        ])),
      })),
    ),
  )

  it.effect("set auto-appends catch-all when missing", () => {
    let putBody: any = null
    return Effect.gen(function* () {
      const mgr = yield* IngressManager
      yield* mgr.set("tunnel-1", [
        new IngressRule({ hostname: "app.example.com", service: "http://localhost:3000" }),
      ])
      const ingress = putBody?.config?.ingress
      assert.strictEqual(ingress.length, 2)
      assert.strictEqual(ingress[1].service, "http_status:404")
    }).pipe(
      Effect.provide(testLayer({
        get: () => Effect.succeed(cfConfig([])),
        put: (_path, body) => { putBody = body; return Effect.succeed({}) },
      })),
    )
  })
})
