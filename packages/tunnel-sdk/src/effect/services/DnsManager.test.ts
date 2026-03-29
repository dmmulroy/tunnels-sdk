import { describe, it, assert } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { mockApi } from "./test-helpers.js"
import { DnsManager } from "./DnsManager.js"

const testLayer = (handlers: Parameters<typeof mockApi>[0]) =>
  DnsManager.layer.pipe(Layer.provide(mockApi(handlers)))

describe("DnsManager (Effect)", () => {
  it.effect("ensure creates CNAME record", () => {
    let postedBody: any = null
    let postedPath = ""
    return Effect.gen(function* () {
      const mgr = yield* DnsManager
      yield* mgr.ensure("tunnel-1", "app.example.com")
      assert.strictEqual(postedPath, "/zones/zone-1/dns_records")
      assert.strictEqual(postedBody.type, "CNAME")
      assert.strictEqual(postedBody.content, "tunnel-1.cfargotunnel.com")
      assert.strictEqual(postedBody.proxied, true)
    }).pipe(
      Effect.provide(testLayer({
        get: (path, params) => {
          if (path === "/zones" && params?.name === "example.com") {
            return Effect.succeed([{ id: "zone-1", name: "example.com", status: "active" }])
          }
          if (path.includes("/dns_records")) {
            return Effect.succeed([]) // no existing record
          }
          return Effect.succeed([])
        },
        post: (path, body) => {
          postedPath = path
          postedBody = body
          return Effect.succeed({})
        },
      })),
    )
  })

  it.effect("ensure updates existing record if content differs", () => {
    let putPath = ""
    let putBody: any = null
    return Effect.gen(function* () {
      const mgr = yield* DnsManager
      yield* mgr.ensure("tunnel-2", "app.example.com")
      assert.strictEqual(putPath, "/zones/zone-1/dns_records/dns-1")
      assert.strictEqual(putBody.content, "tunnel-2.cfargotunnel.com")
    }).pipe(
      Effect.provide(testLayer({
        get: (path, params) => {
          if (path === "/zones") {
            return Effect.succeed([{ id: "zone-1", name: "example.com", status: "active" }])
          }
          if (path.includes("/dns_records")) {
            return Effect.succeed([{
              id: "dns-1", name: "app.example.com", type: "CNAME",
              content: "old-tunnel.cfargotunnel.com", proxied: true, ttl: 1,
            }])
          }
          return Effect.succeed([])
        },
        put: (path, body) => {
          putPath = path
          putBody = body
          return Effect.succeed({})
        },
      })),
    )
  })

  it.effect("ensure skips update when content matches", () => {
    let putCalled = false
    let postCalled = false
    return Effect.gen(function* () {
      const mgr = yield* DnsManager
      yield* mgr.ensure("tunnel-1", "app.example.com")
      assert.isFalse(putCalled)
      assert.isFalse(postCalled)
    }).pipe(
      Effect.provide(testLayer({
        get: (path) => {
          if (path === "/zones") {
            return Effect.succeed([{ id: "zone-1", name: "example.com", status: "active" }])
          }
          if (path.includes("/dns_records")) {
            return Effect.succeed([{
              id: "dns-1", name: "app.example.com", type: "CNAME",
              content: "tunnel-1.cfargotunnel.com", proxied: true, ttl: 1,
            }])
          }
          return Effect.succeed([])
        },
        put: () => { putCalled = true; return Effect.succeed({}) },
        post: () => { postCalled = true; return Effect.succeed({}) },
      })),
    )
  })

  it.effect("remove deletes existing record", () => {
    let deletedPath = ""
    return Effect.gen(function* () {
      const mgr = yield* DnsManager
      yield* mgr.remove("tunnel-1", "app.example.com")
      assert.strictEqual(deletedPath, "/zones/zone-1/dns_records/dns-1")
    }).pipe(
      Effect.provide(testLayer({
        get: (path) => {
          if (path === "/zones") {
            return Effect.succeed([{ id: "zone-1", name: "example.com", status: "active" }])
          }
          if (path.includes("/dns_records")) {
            return Effect.succeed([{
              id: "dns-1", name: "app.example.com", type: "CNAME",
              content: "tunnel-1.cfargotunnel.com", proxied: true, ttl: 1,
            }])
          }
          return Effect.succeed([])
        },
        del: (path) => { deletedPath = path; return Effect.succeed(null) },
      })),
    )
  })

  it.effect("remove does nothing when record not found", () => {
    let deleteCalled = false
    return Effect.gen(function* () {
      const mgr = yield* DnsManager
      yield* mgr.remove("tunnel-1", "app.example.com")
      assert.isFalse(deleteCalled)
    }).pipe(
      Effect.provide(testLayer({
        get: (path) => {
          if (path === "/zones") {
            return Effect.succeed([{ id: "zone-1", name: "example.com", status: "active" }])
          }
          return Effect.succeed([])
        },
        del: () => { deleteCalled = true; return Effect.succeed(null) },
      })),
    )
  })

  it.effect("list collects DNS records across zones", () =>
    Effect.gen(function* () {
      const mgr = yield* DnsManager
      const records = yield* mgr.list("tunnel-1")
      assert.strictEqual(records.length, 2)
      assert.strictEqual(records[0].hostname, "app.example.com")
      assert.strictEqual(records[1].hostname, "api.other.com")
    }).pipe(
      Effect.provide(testLayer({
        paginate: () =>
          Stream.fromArray([
            { id: "z1", name: "example.com", status: "active" },
            { id: "z2", name: "other.com", status: "active" },
          ]),
        get: (path) => {
          if (path === "/zones/z1/dns_records") {
            return Effect.succeed([{
              id: "d1", name: "app.example.com", type: "CNAME",
              content: "tunnel-1.cfargotunnel.com", proxied: true, ttl: 1,
            }])
          }
          if (path === "/zones/z2/dns_records") {
            return Effect.succeed([{
              id: "d2", name: "api.other.com", type: "CNAME",
              content: "tunnel-1.cfargotunnel.com", proxied: true, ttl: 1,
            }])
          }
          return Effect.succeed([])
        },
      })),
    ),
  )
})
