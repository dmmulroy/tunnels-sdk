import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { vnet } from "./vnet.js"
import { VNetService } from "../services.js"
import { OutputContext, defaultOutputContext } from "../output.js"
import { TestLayer } from "../test-layer.js"

const makeTestVNetService = Effect.gen(function* () {
  const vnets = yield* Ref.make<ReadonlyArray<{ name: string; isDefault: boolean }>>([
    { name: "production", isDefault: true },
  ])
  return {
    service: VNetService.of({
      create: (name, opts) =>
        Ref.update(vnets, (arr) => [...arr, { name, isDefault: opts?.isDefault ?? false }]),
      list: () => Ref.get(vnets),
      delete: (name) =>
        Ref.update(vnets, (arr) => arr.filter((v) => v.name !== name)),
    }),
    getVNets: Ref.get(vnets),
  }
})

const run = Command.runWith(vnet, { version: "0.1.0" })

describe("tunnels vnet", () => {
  it.effect("creates a vnet", () =>
    Effect.gen(function* () {
      const { service, getVNets } = yield* makeTestVNetService
      yield* run(["create", "staging"]).pipe(
        Effect.provideService(VNetService, service)
      )
      const vnets = yield* getVNets
      assert.strictEqual(vnets.length, 2)
      assert.deepStrictEqual(vnets[1], { name: "staging", isDefault: false })
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("creates a default vnet", () =>
    Effect.gen(function* () {
      const { service, getVNets } = yield* makeTestVNetService
      yield* run(["create", "staging", "--default"]).pipe(
        Effect.provideService(VNetService, service)
      )
      const vnets = yield* getVNets
      assert.deepStrictEqual(vnets[1], { name: "staging", isDefault: true })
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("lists vnets", () =>
    Effect.gen(function* () {
      const { service } = yield* makeTestVNetService
      yield* run(["list"]).pipe(
        Effect.provideService(VNetService, service),
        Effect.provideService(OutputContext, defaultOutputContext)
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("production"))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("deletes a vnet", () =>
    Effect.gen(function* () {
      const { service, getVNets } = yield* makeTestVNetService
      yield* run(["delete", "production"]).pipe(
        Effect.provideService(VNetService, service)
      )
      const vnets = yield* getVNets
      assert.deepStrictEqual(vnets, [])
    }).pipe(Effect.provide(TestLayer))
  )
})
