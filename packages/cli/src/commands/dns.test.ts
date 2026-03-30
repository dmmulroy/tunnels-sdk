import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { dns } from "./dns.js"
import { DnsService } from "../services.js"
import { OutputContext, defaultOutputContext } from "../output.js"
import { TestLayer } from "../test-layer.js"

const makeTestDnsService = Effect.gen(function* () {
  const records = yield* Ref.make<ReadonlyArray<{ hostname: string; tunnel: string }>>([
    { hostname: "app.example.com", tunnel: "my-app" },
  ])
  return {
    service: DnsService.of({
      create: (hostname, tunnel) =>
        Ref.update(records, (arr) => [...arr, { hostname, tunnel }]),
      list: () => Ref.get(records),
      remove: (hostname) =>
        Ref.update(records, (arr) => arr.filter((r) => r.hostname !== hostname)),
    }),
    getRecords: Ref.get(records),
  }
})

const run = Command.runWith(dns, { version: "0.1.0" })

describe("tunnels dns", () => {
  it.effect("creates a DNS record", () =>
    Effect.gen(function* () {
      const { service, getRecords } = yield* makeTestDnsService
      yield* run(["create", "api.example.com", "--tunnel", "my-app"]).pipe(
        Effect.provideService(DnsService, service)
      )
      const records = yield* getRecords
      assert.strictEqual(records.length, 2)
      assert.deepStrictEqual(records[1], { hostname: "api.example.com", tunnel: "my-app" })
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("lists DNS records", () =>
    Effect.gen(function* () {
      const { service } = yield* makeTestDnsService
      yield* run(["list"]).pipe(
        Effect.provideService(DnsService, service),
        Effect.provideService(OutputContext, defaultOutputContext)
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("app.example.com"))
      assert.isTrue(text.includes("my-app"))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("removes a DNS record", () =>
    Effect.gen(function* () {
      const { service, getRecords } = yield* makeTestDnsService
      yield* run(["remove", "app.example.com"]).pipe(
        Effect.provideService(DnsService, service)
      )
      const records = yield* getRecords
      assert.deepStrictEqual(records, [])
    }).pipe(Effect.provide(TestLayer))
  )
})
