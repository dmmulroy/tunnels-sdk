import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { route } from "./route.js"
import { RouteService } from "../services.js"
import { OutputContext, defaultOutputContext } from "../output.js"
import { TestLayer } from "../test-layer.js"

const makeTestRouteService = Effect.gen(function* () {
  const routes = yield* Ref.make<ReadonlyArray<{ network: string; tunnel: string }>>([
    { network: "10.0.0.0/8", tunnel: "my-app" },
  ])
  return {
    service: RouteService.of({
      add: (network, tunnel) =>
        Ref.update(routes, (arr) => [...arr, { network, tunnel }]),
      list: () => Ref.get(routes),
      remove: (network) =>
        Ref.update(routes, (arr) => arr.filter((r) => r.network !== network)),
    }),
    getRoutes: Ref.get(routes),
  }
})

const run = Command.runWith(route, { version: "0.1.0" })

describe("cft route", () => {
  it.effect("adds a route", () =>
    Effect.gen(function* () {
      const { service, getRoutes } = yield* makeTestRouteService
      yield* run(["add", "172.16.0.0/16", "--tunnel", "my-app"]).pipe(
        Effect.provideService(RouteService, service)
      )
      const routes = yield* getRoutes
      assert.strictEqual(routes.length, 2)
      assert.deepStrictEqual(routes[1], { network: "172.16.0.0/16", tunnel: "my-app" })
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("lists routes", () =>
    Effect.gen(function* () {
      const { service } = yield* makeTestRouteService
      yield* run(["list"]).pipe(
        Effect.provideService(RouteService, service),
        Effect.provideService(OutputContext, defaultOutputContext)
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("10.0.0.0/8"))
      assert.isTrue(text.includes("my-app"))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("removes a route", () =>
    Effect.gen(function* () {
      const { service, getRoutes } = yield* makeTestRouteService
      yield* run(["remove", "10.0.0.0/8"]).pipe(
        Effect.provideService(RouteService, service)
      )
      const routes = yield* getRoutes
      assert.deepStrictEqual(routes, [])
    }).pipe(Effect.provide(TestLayer))
  )
})
