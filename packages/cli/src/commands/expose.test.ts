import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { expose } from "./expose.js"
import { QuickTunnelService, TunnelApiService, IngressService, DnsService } from "../services.js"
import { CliError } from "../errors.js"
import { TestLayer } from "../test-layer.js"

const makeTestQuickTunnel = Effect.gen(function* () {
  const calls = yield* Ref.make<ReadonlyArray<number>>([])
  return {
    service: QuickTunnelService.of({
      expose: (port) =>
        Effect.gen(function* () {
          yield* Ref.update(calls, (arr) => [...arr, port])
          return { url: `https://test-${port}.trycloudflare.com` }
        }),
    }),
    getCalls: Ref.get(calls),
  }
})

const run = Command.runWith(expose, { version: "0.1.0" })

describe("tunnels expose", () => {
  it.effect("exposes a port and prints the tunnel URL", () =>
    Effect.gen(function* () {
      const { service, getCalls } = yield* makeTestQuickTunnel
      yield* run(["3000"]).pipe(
        Effect.provideService(QuickTunnelService, service)
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("https://test-3000.trycloudflare.com"))

      const calls = yield* getCalls
      assert.deepStrictEqual(calls, [3000])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("propagates TunnelRuntimeError when binary fails", () =>
    Effect.gen(function* () {
      const service = QuickTunnelService.of({
        expose: () => Effect.fail(CliError.TunnelRuntimeError({ message: "cloudflared not found" })),
      })
      const result = yield* run(["3000"]).pipe(
        Effect.provideService(QuickTunnelService, service),
        Effect.exit
      )
      assert.isTrue(result._tag === "Failure")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("with --hostname creates named tunnel, ingress, and DNS", () =>
    Effect.gen(function* () {
      const created = yield* Ref.make<ReadonlyArray<string>>([])
      const ingressAdded = yield* Ref.make<ReadonlyArray<{ hostname: string; service: string }>>([])
      const dnsCreated = yield* Ref.make<ReadonlyArray<{ hostname: string; tunnel: string }>>([])

      const tunnelApi = TunnelApiService.of({
        create: (name) =>
          Effect.gen(function* () {
            yield* Ref.update(created, (arr) => [...arr, name])
            return { id: "tun-123", name }
          }),
        list: () => Effect.succeed([]),
        get: () => Effect.die("unused"),
        delete: () => Effect.die("unused"),
      })
      const ingressSvc = IngressService.of({
        add: (hostname, service) =>
          Ref.update(ingressAdded, (arr) => [...arr, { hostname, service }]),
        list: () => Effect.succeed([]),
        remove: () => Effect.die("unused"),
      })
      const dnsSvc = DnsService.of({
        create: (hostname, tunnel) =>
          Ref.update(dnsCreated, (arr) => [...arr, { hostname, tunnel }]),
        list: () => Effect.succeed([]),
        remove: () => Effect.die("unused"),
      })

      yield* run(["3000", "--hostname", "app.example.com"]).pipe(
        Effect.provideService(TunnelApiService, tunnelApi),
        Effect.provideService(IngressService, ingressSvc),
        Effect.provideService(DnsService, dnsSvc),
      )

      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("app.example.com"))

      const tunnels = yield* Ref.get(created)
      assert.strictEqual(tunnels.length, 1)

      const ingress = yield* Ref.get(ingressAdded)
      assert.deepStrictEqual(ingress, [{ hostname: "app.example.com", service: "http://localhost:3000" }])

      const dns = yield* Ref.get(dnsCreated)
      assert.deepStrictEqual(dns, [{ hostname: "app.example.com", tunnel: tunnels[0] }])
    }).pipe(Effect.provide(TestLayer))
  )
})
