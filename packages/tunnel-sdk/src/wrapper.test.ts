import { describe, it, expect, afterEach, vi } from "vitest"
import { Effect, Layer, ManagedRuntime, Stream } from "effect"
import {
  TestLayer,
  VNetManager,
  VNet,
  TunnelOperations,
  TunnelInfo,
  TunnelConnection,
  CloudflaredBinary,
} from "./effect/index.js"

// We test the wrapper using TestLayer (stubbed services) instead of LiveLayer
// to avoid real HTTP calls. The wrapper delegates to ManagedRuntime.runPromise.

describe("TunnelClient wrapper", () => {
  it("_fromLayer creates with sub-clients", async () => {
    const { TunnelClient } = await import("./wrapper.js")
    const client = TunnelClient._fromLayer(TestLayer)

    expect(client.tunnels).toBeDefined()
    expect(client.ingress).toBeDefined()
    expect(client.dns).toBeDefined()
    expect(client.routes).toBeDefined()
    expect(client.vnets).toBeDefined()
    expect(typeof client.dispose).toBe("function")

    await client.dispose()
  })

  it("public constructor creates without throwing", async () => {
    const { TunnelClient } = await import("./wrapper.js")
    // Just verify construction works — the runtime isn't used until a method is called
    const client = new TunnelClient({
      accountId: "test-account",
      apiToken: "test-token",
    })

    expect(client.tunnels).toBeDefined()
    expect(client.ingress).toBeDefined()
    expect(client.dns).toBeDefined()
    expect(client.routes).toBeDefined()
    expect(client.vnets).toBeDefined()

    await client.dispose()
  })

  it("sub-client list methods return arrays via TestLayer stubs", async () => {
    const { TunnelClient } = await import("./wrapper.js")
    const client = TunnelClient._fromLayer(TestLayer)

    expect(await client.vnets.list()).toEqual([])
    expect(await client.ingress.list("tid")).toEqual([])
    expect(await client.dns.list("tid")).toEqual([])
    expect(await client.routes.list("tid")).toEqual([])

    await client.dispose()
  })

  it("delegates to overridden services in custom layer", async () => {
    const { TunnelClient } = await import("./wrapper.js")

    const fakeVNet = new VNet({
      id: "vnet-1",
      name: "my-vnet",
      isDefault: true,
      comment: "test",
    })

    // Override VNetManager with real data, merge with rest of TestLayer
    const vnetOverride = Layer.succeed(
      VNetManager,
      VNetManager.of({
        create: () => Effect.succeed(fakeVNet),
        del: () => Effect.succeed(void 0),
        list: () => Effect.succeed([fakeVNet]),
      }),
    )

    // Build layer: override takes precedence via Layer.merge (second arg wins)
    const customLayer = Layer.merge(TestLayer, vnetOverride)

    const client = TunnelClient._fromLayer(customLayer)
    const vnets = await client.vnets.list()

    expect(vnets).toHaveLength(1)
    expect(vnets[0].name).toBe("my-vnet")
    expect(vnets[0].isDefault).toBe(true)

    await client.dispose()
  })

  it("tunnels.create() delegates and returns TunnelInfo", async () => {
    const { TunnelClient } = await import("./wrapper.js")

    const fakeTunnel = new TunnelInfo({
      id: "abc-123",
      name: "test-tunnel",
      status: "healthy",
      createdAt: "2024-01-01T00:00:00Z",
      deletedAt: null,
      connections: [],
      remoteConfig: true,
    })

    const opsOverride = Layer.succeed(
      TunnelOperations,
      TunnelOperations.of({
        create: () => Effect.succeed(fakeTunnel),
        list: () => Effect.succeed([fakeTunnel]),
        listAll: () => Stream.fromArray([fakeTunnel]),
        get: () => Effect.succeed(fakeTunnel),
        del: () => Effect.succeed(void 0),
        getToken: () => Effect.succeed("tok_123"),
        refresh: () => Effect.succeed(fakeTunnel),
      }),
    )

    const client = TunnelClient._fromLayer(Layer.merge(TestLayer, opsOverride))

    const created = await client.tunnels.create("test-tunnel")
    expect(created.id).toBe("abc-123")
    expect(created.name).toBe("test-tunnel")
    expect(created.status).toBe("healthy")

    const listed = await client.tunnels.list()
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe("test-tunnel")

    const got = await client.tunnels.get("abc-123")
    expect(got.id).toBe("abc-123")

    const token = await client.tunnels.getToken("abc-123")
    expect(token).toBe("tok_123")

    await client.tunnels.delete("abc-123") // should not throw

    await client.dispose()
  })

  it("tunnels.listAll() yields items via async generator", async () => {
    const { TunnelClient } = await import("./wrapper.js")

    const t1 = new TunnelInfo({
      id: "t1",
      name: "first",
      status: "healthy",
      createdAt: "2024-01-01",
      deletedAt: null,
      connections: [],
      remoteConfig: true,
    })
    const t2 = new TunnelInfo({
      id: "t2",
      name: "second",
      status: "inactive",
      createdAt: "2024-01-02",
      deletedAt: null,
      connections: [],
      remoteConfig: true,
    })

    const opsOverride = Layer.succeed(
      TunnelOperations,
      TunnelOperations.of({
        create: () => Effect.die("not needed"),
        list: () => Effect.die("not needed"),
        listAll: () => Stream.fromArray([t1, t2]),
        get: () => Effect.die("not needed"),
        del: () => Effect.die("not needed"),
        getToken: () => Effect.die("not needed"),
        refresh: () => Effect.die("not needed"),
      }),
    )

    const client = TunnelClient._fromLayer(Layer.merge(TestLayer, opsOverride))

    const items: any[] = []
    for await (const tunnel of client.tunnels.listAll()) {
      items.push(tunnel)
    }

    expect(items).toHaveLength(2)
    expect(items[0].name).toBe("first")
    expect(items[1].name).toBe("second")

    await client.dispose()
  })

  it("errors from services surface as rejected promises", async () => {
    const { TunnelClient } = await import("./wrapper.js")
    // TestLayer stubs TunnelOperations.create as Effect.die("not stubbed")
    const client = TunnelClient._fromLayer(TestLayer)

    await expect(client.tunnels.create("test")).rejects.toThrow()

    await client.dispose()
  })

  it("dispose() cleans up the runtime", async () => {
    const { TunnelClient } = await import("./wrapper.js")
    const client = TunnelClient._fromLayer(TestLayer)
    
    // Should not throw
    await client.dispose()
    
    // Second dispose should also not throw (idempotent)
    await client.dispose()
  })

  it("ingress/dns/routes sub-clients delegate correctly", async () => {
    const { TunnelClient } = await import("./wrapper.js")
    const { IngressManager, DnsManager, RouteManager, IngressRule, DnsRecord, Route } =
      await import("./effect/index.js")

    const fakeRule = new IngressRule({
      hostname: "app.example.com",
      service: "http://localhost:3000",
    })
    const fakeDns = new DnsRecord({
      hostname: "app.example.com",
      type: "CNAME",
      content: "tid.cfargotunnel.com",
    })
    const fakeRoute = new Route({
      network: "10.0.0.0/8",
      tunnelId: "tid",
      vnet: "default",
    })

    const overrides = Layer.mergeAll(
      Layer.succeed(
        IngressManager,
        IngressManager.of({
          list: () => Effect.succeed([fakeRule]),
          add: () => Effect.succeed(void 0),
          remove: () => Effect.succeed(void 0),
          set: () => Effect.succeed(void 0),
        }),
      ),
      Layer.succeed(
        DnsManager,
        DnsManager.of({
          ensure: () => Effect.succeed(void 0),
          remove: () => Effect.succeed(void 0),
          list: () => Effect.succeed([fakeDns]),
        }),
      ),
      Layer.succeed(
        RouteManager,
        RouteManager.of({
          add: () => Effect.succeed(void 0),
          remove: () => Effect.succeed(void 0),
          list: () => Effect.succeed([fakeRoute]),
          check: () => Effect.succeed(null),
        }),
      ),
    )

    const client = TunnelClient._fromLayer(Layer.merge(TestLayer, overrides))

    const rules = await client.ingress.list("tid")
    expect(rules).toHaveLength(1)
    expect(rules[0].hostname).toBe("app.example.com")

    const dns = await client.dns.list("tid")
    expect(dns).toHaveLength(1)
    expect(dns[0].hostname).toBe("app.example.com")

    const routes = await client.routes.list("tid")
    expect(routes).toHaveLength(1)
    expect(routes[0].network).toBe("10.0.0.0/8")

    const check = await client.routes.check("10.0.0.1")
    expect(check).toBeNull()

    // Write operations should not throw
    await client.ingress.add("tid", fakeRule)
    await client.ingress.remove("tid", "app.example.com")
    await client.dns.ensure("tid", "app.example.com")
    await client.dns.remove("tid", "app.example.com")
    await client.routes.add("tid", "10.0.0.0/8")
    await client.routes.remove("tid", "10.0.0.0/8")

    await client.dispose()
  })
})

describe("expose() wrapper", () => {
  it("exports the expose function", async () => {
    const { expose } = await import("./wrapper.js")
    expect(typeof expose).toBe("function")
  })
})

describe("index.ts re-exports", () => {
  it("exports TunnelClient and expose from index", async () => {
    const idx = await import("./index.js")
    expect(idx.TunnelClient).toBeDefined()
    expect(typeof idx.expose).toBe("function")
    expect(typeof idx.parseConfig).toBe("function")
    expect(typeof idx.parseConfigFromYaml).toBe("function")
    expect(typeof idx.parseConfigFromFile).toBe("function")
  })

  it("TunnelClient from index works the same as from wrapper", async () => {
    const { TunnelClient } = await import("./index.js")
    const client = new TunnelClient({
      accountId: "test",
      apiToken: "test-token",
    })
    expect(client.tunnels).toBeDefined()
    expect(client.ingress).toBeDefined()
    await client.dispose()
  })
})
