/**
 * Testing Effect services with the TestLayer.
 *
 * Shows how to test code that uses tunnel-sdk/effect services
 * by providing a TestLayer with stubbed implementations.
 * You can override individual services for precise control.
 */
import { Effect, Layer, Stream } from "effect"
import {
  TunnelOperations,
  VNetManager,
  TunnelInfo,
  VNet,
  TestLayer,
} from "tunnel-sdk/effect"

// Your application code — depends on TunnelOperations
const createAndListTunnels = Effect.gen(function* () {
  const ops = yield* TunnelOperations
  const tunnel = yield* ops.create("test-tunnel")
  const all = yield* ops.list()
  return { created: tunnel, total: all.length }
})

// Test with overridden TunnelOperations
const fakeTunnel = new TunnelInfo({
  id: "fake-id",
  name: "test-tunnel",
  status: "healthy",
  createdAt: new Date().toISOString(),
  deletedAt: null,
  connections: [],
  remoteConfig: true,
})

const testOps = Layer.succeed(
  TunnelOperations,
  TunnelOperations.of({
    create: () => Effect.succeed(fakeTunnel),
    list: () => Effect.succeed([fakeTunnel]),
    listAll: () => Stream.fromArray([fakeTunnel]),
    get: () => Effect.succeed(fakeTunnel),
    del: () => Effect.succeed(void 0),
    getToken: () => Effect.succeed("test-token"),
    refresh: () => Effect.succeed(fakeTunnel),
  }),
)

// Run with the test layer (override merges with TestLayer defaults)
const testLayer = Layer.merge(TestLayer, testOps)

const result = await Effect.runPromise(
  createAndListTunnels.pipe(Effect.provide(testLayer)),
)

console.log(`Created: ${result.created.name}`)
console.log(`Total tunnels: ${result.total}`)
console.log("✅ Test passed!")

// You can also test VNet operations
const testVNets = Layer.succeed(
  VNetManager,
  VNetManager.of({
    create: (name) =>
      Effect.succeed(new VNet({ id: "v1", name, isDefault: false })),
    del: () => Effect.succeed(void 0),
    list: () =>
      Effect.succeed([
        new VNet({ id: "v1", name: "production", isDefault: true }),
        new VNet({ id: "v2", name: "staging", isDefault: false }),
      ]),
  }),
)

const vnets = await Effect.runPromise(
  VNetManager.use((svc) => svc.list()).pipe(
    Effect.provide(Layer.merge(TestLayer, testVNets)),
  ),
)

console.log(`VNets: ${vnets.map((v) => v.name).join(", ")}`)
console.log("✅ VNet test passed!")
