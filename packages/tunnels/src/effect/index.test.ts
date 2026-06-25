import { describe, it, assert } from "@effect/vitest"
import { Effect } from "effect"
import {
  TunnelOperations,
  IngressManager,
  DnsManager,
  RouteManager,
  VNetManager,
  CloudflaredBinary,
  TunnelProcessService,
  CloudflareApi,
  CloudflareApiConfig,
  CloudflareAuth,
  makeApiTokenAuth,
  TestLayer,
  LiveLayer,
} from "./index.js"

describe("effect/index.ts barrel exports", () => {
  it.effect("TestLayer provides all services", () =>
    Effect.gen(function* () {
      const ops = yield* TunnelOperations
      assert.isDefined(ops)
      const ingress = yield* IngressManager
      assert.isDefined(ingress)
      const dns = yield* DnsManager
      assert.isDefined(dns)
      const routes = yield* RouteManager
      assert.isDefined(routes)
      const vnets = yield* VNetManager
      assert.isDefined(vnets)
      const binary = yield* CloudflaredBinary
      assert.isDefined(binary)
      const process = yield* TunnelProcessService
      assert.isDefined(process)
      const api = yield* CloudflareApi
      assert.isDefined(api)
      const auth = yield* CloudflareAuth
      assert.isDefined(auth)
    }).pipe(Effect.provide(TestLayer)),
  )

  it("LiveLayer type-checks with config", () => {
    // This just needs to compile — proves layer composition is sound
    const _layer = LiveLayer(
      new CloudflareApiConfig({
        accountId: "test",
      }),
      makeApiTokenAuth("test-token"),
    )
    assert.isDefined(_layer)
  })
})
