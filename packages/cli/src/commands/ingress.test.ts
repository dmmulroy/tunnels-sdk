import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { ingress } from "./ingress.js"
import { IngressService } from "../services.js"
import { OutputContext, defaultOutputContext } from "../output.js"
import { TestLayer } from "../test-layer.js"

interface IngressRule { hostname: string; service: string }

const makeTestIngressService = Effect.gen(function* () {
  const rules = yield* Ref.make<ReadonlyArray<IngressRule>>([
    { hostname: "app.example.com", service: "http://localhost:3000" },
  ])
  return {
    service: IngressService.of({
      add: (hostname, service) =>
        Ref.update(rules, (arr) => [...arr, { hostname, service }]),
      list: () => Ref.get(rules),
      remove: (hostname) =>
        Ref.update(rules, (arr) => arr.filter((r) => r.hostname !== hostname)),
    }),
    getRules: Ref.get(rules),
  }
})

const run = Command.runWith(ingress, { version: "0.1.0" })

describe("tunnels ingress", () => {
  it.effect("adds an ingress rule", () =>
    Effect.gen(function* () {
      const { service, getRules } = yield* makeTestIngressService
      yield* run(["add", "api.example.com", "http://localhost:8080"]).pipe(
        Effect.provideService(IngressService, service)
      )
      const rules = yield* getRules
      assert.deepStrictEqual(rules, [
        { hostname: "app.example.com", service: "http://localhost:3000" },
        { hostname: "api.example.com", service: "http://localhost:8080" },
      ])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("lists ingress rules", () =>
    Effect.gen(function* () {
      const { service } = yield* makeTestIngressService
      yield* run(["list"]).pipe(
        Effect.provideService(IngressService, service),
        Effect.provideService(OutputContext, defaultOutputContext)
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("app.example.com"))
      assert.isTrue(text.includes("http://localhost:3000"))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("removes an ingress rule", () =>
    Effect.gen(function* () {
      const { service, getRules } = yield* makeTestIngressService
      yield* run(["remove", "app.example.com"]).pipe(
        Effect.provideService(IngressService, service)
      )
      const rules = yield* getRules
      assert.deepStrictEqual(rules, [])
    }).pipe(Effect.provide(TestLayer))
  )
})
