import { describe, it, assert } from "@effect/vitest"
import { Effect, Layer, Stream } from "effect"
import { TunnelApiService } from "./services.js"
import { CftError } from "./errors.js"
import {
  TunnelOperations,
  TunnelProcessService,
  type TunnelInfo as SdkTunnelInfo,
} from "tunnel-sdk/effect"
import { TunnelApiServiceLive } from "./live-layer.js"

// ---------------------------------------------------------------------------
// Stubs for SDK services
// ---------------------------------------------------------------------------

const fakeTunnel: SdkTunnelInfo = {
  id: "t-1",
  name: "my-app",
  status: "healthy",
  createdAt: "2024-01-01",
  deletedAt: null,
  connections: [],
  remoteConfig: false,
}

const stubOps = (overrides: Partial<TunnelOperations["Service"]> = {}) =>
  Layer.succeed(
    TunnelOperations,
    TunnelOperations.of({
      create: () => Effect.succeed(fakeTunnel),
      list: () => Effect.succeed([fakeTunnel]),
      get: () => Effect.succeed(fakeTunnel),
      del: () => Effect.void,
      getToken: () => Effect.succeed("test-token"),
      refresh: () => Effect.succeed(fakeTunnel),
      ...overrides,
    }),
  )

const stubProcess = (overrides: Partial<TunnelProcessService["Service"]> = {}) =>
  Layer.succeed(
    TunnelProcessService,
    TunnelProcessService.of({
      run: () =>
        Effect.succeed({
          events: Stream.empty,
          logs: Stream.empty,
          status: Effect.succeed("healthy" as const),
          connectors: Effect.succeed([]),
          waitUntilHealthy: Effect.void,
          exitCode: Effect.never, // process runs forever until killed
        }),
      ...overrides,
    }),
  )

describe("TunnelApiService adapter (run/stop/getLogs)", () => {
  const testLayer = TunnelApiServiceLive.pipe(
    Layer.provide(stubOps()),
    Layer.provide(stubProcess()),
  )

  it.effect("run then stop succeeds", () =>
    Effect.gen(function* () {
      const svc = yield* TunnelApiService
      yield* svc.run("my-app")
      yield* svc.stop("my-app")
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("getLogs returns entries from a running tunnel", () =>
    Effect.gen(function* () {
      const svc = yield* TunnelApiService
      yield* svc.run("my-app")
      const logs = yield* svc.getLogs("my-app")
      assert.strictEqual(logs.length, 2)
      assert.strictEqual(logs[0].level, "info")
      assert.strictEqual(logs[0].message, "Starting tunnel")
      assert.strictEqual(logs[1].level, "warn")
      assert.strictEqual(logs[1].message, "Connected")
    }).pipe(
      Effect.provide(
        TunnelApiServiceLive.pipe(
          Layer.provide(stubOps()),
          Layer.provide(stubProcess({
            run: () =>
              Effect.succeed({
                events: Stream.empty,
                logs: Stream.fromArray([
                  { timestamp: new Date("2024-01-15T10:30:00Z"), level: "info" as const, event: "startup", message: "Starting tunnel", connectorId: undefined },
                  { timestamp: new Date("2024-01-15T10:30:01Z"), level: "warn" as const, event: "tunnelConnection", message: "Connected", connectorId: undefined },
                ]),
                status: Effect.succeed("healthy" as const),
                connectors: Effect.succeed([]),
                waitUntilHealthy: Effect.void,
                exitCode: Effect.never,
              }),
          })),
        ),
      ),
    ),
  )

  it.effect("getLogs on non-running tunnel returns UserError", () =>
    Effect.gen(function* () {
      const svc = yield* TunnelApiService
      const exit = yield* svc.getLogs("nonexistent").pipe(Effect.exit)
      assert.isTrue(exit._tag === "Failure")
    }).pipe(Effect.provide(testLayer)),
  )

  it.effect("stop on unknown tunnel returns UserError", () =>
    Effect.gen(function* () {
      const svc = yield* TunnelApiService
      const exit = yield* svc.stop("nonexistent").pipe(Effect.exit)
      assert.isTrue(exit._tag === "Failure")
      if (exit._tag === "Failure") {
        const err = exit.cause.reasons[0].error as CftError
        assert.strictEqual(err._tag, "UserError")
        assert.isTrue(err.message.includes("nonexistent"))
      }
    }).pipe(Effect.provide(testLayer)),
  )
})
