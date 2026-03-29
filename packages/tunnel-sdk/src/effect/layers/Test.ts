import { Effect, Layer, Stream } from "effect"
import { CloudflareApi } from "../services/CloudflareApi.js"
import { TunnelOperations } from "../services/TunnelOperations.js"
import { IngressManager } from "../services/IngressManager.js"
import { DnsManager } from "../services/DnsManager.js"
import { RouteManager } from "../services/RouteManager.js"
import { VNetManager } from "../services/VNetManager.js"
import { TunnelProcessService } from "../services/TunnelProcess.js"
import { CloudflaredBinary } from "../services/CloudflaredBinary.js"

const die = (msg: string) => Effect.die(new Error(msg))

/**
 * Test layer — all services stubbed with "not implemented" defaults.
 * Override individual services with Layer.provide to inject test data.
 */
export const TestLayer = Layer.mergeAll(
  Layer.succeed(
    CloudflareApi,
    CloudflareApi.of({
      get: () => die("TestLayer: CloudflareApi.get not stubbed"),
      post: () => die("TestLayer: CloudflareApi.post not stubbed"),
      put: () => die("TestLayer: CloudflareApi.put not stubbed"),
      del: () => die("TestLayer: CloudflareApi.del not stubbed"),
      paginate: () => Stream.empty,
      accountPath: (path) => `/accounts/test-account${path}`,
      zonePath: (zoneId, path) => `/zones/${zoneId}${path}`,
    }),
  ),
  Layer.succeed(
    TunnelOperations,
    TunnelOperations.of({
      create: () => die("TestLayer: TunnelOperations.create not stubbed"),
      list: () => die("TestLayer: TunnelOperations.list not stubbed"),
      listAll: () => Stream.empty,
      get: () => die("TestLayer: TunnelOperations.get not stubbed"),
      del: () => die("TestLayer: TunnelOperations.del not stubbed"),
      getToken: () => die("TestLayer: TunnelOperations.getToken not stubbed"),
      refresh: () => die("TestLayer: TunnelOperations.refresh not stubbed"),
    }),
  ),
  Layer.succeed(
    IngressManager,
    IngressManager.of({
      list: () => Effect.succeed([]),
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
      list: () => Effect.succeed([]),
    }),
  ),
  Layer.succeed(
    RouteManager,
    RouteManager.of({
      add: () => Effect.succeed(void 0),
      remove: () => Effect.succeed(void 0),
      list: () => Effect.succeed([]),
      check: () => Effect.succeed(null),
    }),
  ),
  Layer.succeed(
    VNetManager,
    VNetManager.of({
      create: () => die("TestLayer: VNetManager.create not stubbed"),
      del: () => die("TestLayer: VNetManager.del not stubbed"),
      list: () => Effect.succeed([]),
    }),
  ),
  Layer.succeed(
    TunnelProcessService,
    TunnelProcessService.of({
      run: () => die("TestLayer: TunnelProcessService.run not stubbed"),
    }),
  ),
  Layer.succeed(
    CloudflaredBinary,
    CloudflaredBinary.of({
      path: Effect.succeed("/test/cloudflared"),
      ensureInstalled: () => Effect.succeed("/test/cloudflared"),
      install: () => Effect.succeed(void 0),
      isInstalled: () => Effect.succeed(true),
    }),
  ),
)
