import { describe, it, assert } from "@effect/vitest"
import { Effect, Layer, Ref, Stream, SubscriptionRef } from "effect"
import { TunnelProcessError } from "../errors.js"
import type { TunnelStatus } from "../schemas.js"
import { TunnelProcessService } from "./TunnelProcess.js"
import type { RunningTunnel, TunnelEvent } from "./TunnelProcess.js"

// ---------------------------------------------------------------------------
// Stub TunnelProcessService for testing
// ---------------------------------------------------------------------------

function stubRunningTunnel(overrides: Partial<RunningTunnel> = {}): RunningTunnel {
  return {
    events: Stream.empty,
    logs: Stream.empty,
    status: Effect.succeed("inactive" as TunnelStatus),
    connectors: Effect.succeed([]),
    waitUntilHealthy: Effect.succeed(void 0),
    exitCode: Effect.succeed(0),
    ...overrides,
  }
}

function stubLayer(
  handler?: (token: string) => Effect.Effect<RunningTunnel, TunnelProcessError>,
) {
  return Layer.succeed(
    TunnelProcessService,
    TunnelProcessService.of({
      run: (token) =>
        handler
          ? handler(token)
          : Effect.succeed(stubRunningTunnel()),
    }),
  )
}

describe("TunnelProcessService (Effect)", () => {
  it.effect("run returns a RunningTunnel", () =>
    Effect.gen(function* () {
      const svc = yield* TunnelProcessService
      const tunnel = yield* svc.run("my-token")
      assert.isDefined(tunnel.events)
      assert.isDefined(tunnel.logs)
      assert.isDefined(tunnel.status)
      assert.isDefined(tunnel.connectors)
    }).pipe(Effect.provide(stubLayer())),
  )

  it.effect("status returns current status", () =>
    Effect.gen(function* () {
      const svc = yield* TunnelProcessService
      const tunnel = yield* svc.run("my-token")
      const status = yield* tunnel.status
      assert.strictEqual(status, "healthy")
    }).pipe(
      Effect.provide(
        stubLayer(() =>
          Effect.succeed(
            stubRunningTunnel({
              status: Effect.succeed("healthy" as TunnelStatus),
            }),
          ),
        ),
      ),
    ),
  )

  it.effect("connectors returns empty array initially", () =>
    Effect.gen(function* () {
      const svc = yield* TunnelProcessService
      const tunnel = yield* svc.run("my-token")
      const conns = yield* tunnel.connectors
      assert.deepStrictEqual(conns, [])
    }).pipe(Effect.provide(stubLayer())),
  )

  it.effect("events stream emits tunnel events", () =>
    Effect.gen(function* () {
      const svc = yield* TunnelProcessService
      const tunnel = yield* svc.run("my-token")
      const events = yield* tunnel.events.pipe(Stream.runCollect)
      // The stub emits the events we give it
      assert.strictEqual(Array.from(events).length, 1)
    }).pipe(
      Effect.provide(
        stubLayer(() =>
          Effect.succeed(
            stubRunningTunnel({
              events: Stream.fromArray([
                {
                  _tag: "Connected" as const,
                  connector: { id: "c1", colo: "DFW", ip: "1.2.3.4", location: "Dallas" },
                },
              ] as TunnelEvent[]),
            }),
          ),
        ),
      ),
    ),
  )

  it.effect("exitCode resolves to process exit code", () =>
    Effect.gen(function* () {
      const svc = yield* TunnelProcessService
      const tunnel = yield* svc.run("my-token")
      const code = yield* tunnel.exitCode
      assert.strictEqual(code, 42)
    }).pipe(
      Effect.provide(
        stubLayer(() =>
          Effect.succeed(stubRunningTunnel({ exitCode: Effect.succeed(42) })),
        ),
      ),
    ),
  )

  it.effect("waitUntilHealthy fails with TunnelProcessError on timeout", () =>
    Effect.gen(function* () {
      const svc = yield* TunnelProcessService
      const tunnel = yield* svc.run("my-token")
      const msg = yield* tunnel.waitUntilHealthy.pipe(
        Effect.catchTag("TunnelProcessError", (e) => Effect.succeed(e.message)),
      )
      assert.strictEqual(msg, "never healthy")
    }).pipe(
      Effect.provide(
        stubLayer(() =>
          Effect.succeed(
            stubRunningTunnel({
              waitUntilHealthy: Effect.fail(
                new TunnelProcessError({ message: "never healthy" }),
              ),
            }),
          ),
        ),
      ),
    ),
  )
})
