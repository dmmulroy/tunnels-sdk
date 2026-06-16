# Effect Refactor Plan — `tunnels`

## Overview

Refactor the entire `tunnels` from class-based async/await TypeScript to idiomatic Effect TS. Two entry points:

| Entry point | What consumers get |
|---|---|
| `tunnels/effect` | Pure Effect services, layers, schemas, errors — full composability |
| `tunnels` | Thin async/await wrapper via `ManagedRuntime` — drop-in for non-Effect users |

The `tunnels` CLI package already uses Effect and will become a direct consumer of `tunnels/effect`, replacing its current placeholder `LiveLayer`.

---

## Source Layout

```
packages/tunnels/src/
├── effect/                          # ← NEW: Pure Effect SDK (primary source of truth)
│   ├── index.ts                     #   Re-exports everything for tunnels/effect
│   │
│   ├── errors.ts                    #   Schema.TaggedErrorClass errors
│   ├── schemas.ts                   #   Effect Schema versions of all domain types
│   ├── config.ts                    #   TunnelConfig validation (Effect Schema, replaces Zod)
│   │
│   ├── services/
│   │   ├── CloudflareApi.ts         #   HTTP client service (HttpClient + retryTransient)
│   │   ├── TunnelOperations.ts      #   Tunnel CRUD (create, list, get, delete)
│   │   ├── DnsManager.ts            #   DNS record management (Cache for zone lookups)
│   │   ├── IngressManager.ts        #   Ingress rule management
│   │   ├── RouteManager.ts          #   Private network route management
│   │   ├── VNetManager.ts           #   Virtual network management
│   │   ├── CloudflaredBinary.ts     #   Binary resolution & installation
│   │   └── TunnelProcess.ts         #   cloudflared process (ChildProcess + SubscriptionRef)
│   │
│   └── layers/
│       ├── Live.ts                  #   Full production layer (all services wired)
│       └── Test.ts                  #   Test layer with stubbed services
│
├── index.ts                         # ← REWRITTEN: Thin async/await wrapper
└── bin/                             #   Kept as-is (re-used by CloudflaredBinary service)
    ├── index.ts
    └── cloudflared.ts
```

---

## Errors — `effect/errors.ts`

Replace the class hierarchy (`TunnelSdkError → TunnelApiError`, etc.) with `Schema.TaggedErrorClass`. Every error gets a `_tag` discriminant for `Effect.catchTag`.

```ts
import { Schema } from "effect"

// Base SDK error — catch-all for generic failures
export class TunnelSdkError extends Schema.TaggedErrorClass<TunnelSdkError>()(
  "TunnelSdkError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

// Cloudflare API returned a non-success response
export class TunnelApiError extends Schema.TaggedErrorClass<TunnelApiError>()(
  "TunnelApiError",
  {
    status: Schema.Number,
    errors: Schema.Array(
      Schema.Struct({
        code: Schema.Number,
        message: Schema.String,
      })
    ),
  }
) {}

// 401/403 from the API
export class TunnelAuthError extends Schema.TaggedErrorClass<TunnelAuthError>()(
  "TunnelAuthError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "Authentication failed. Check your API token and account ID.",
    }),
  }
) {}

// Tunnel lookup by name/id found nothing
export class TunnelNotFoundError extends Schema.TaggedErrorClass<TunnelNotFoundError>()(
  "TunnelNotFoundError",
  {
    tunnelRef: Schema.String,
  }
) {}

// cloudflared process failed to start or crashed
export class TunnelProcessError extends Schema.TaggedErrorClass<TunnelProcessError>()(
  "TunnelProcessError",
  {
    message: Schema.String,
    exitCode: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Defect),
  }
) {}

// Binary download/install failed
export class BinaryInstallError extends Schema.TaggedErrorClass<BinaryInstallError>()(
  "BinaryInstallError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

// Config validation failed (replaces ZodError)
export class ConfigValidationError extends Schema.TaggedErrorClass<ConfigValidationError>()(
  "ConfigValidationError",
  {
    message: Schema.String,
    issues: Schema.Array(Schema.Struct({
      path: Schema.Array(Schema.Union(Schema.String, Schema.Number)),
      message: Schema.String,
    })),
  }
) {}
```

This gives consumers:
```ts
Effect.catchTag("TunnelAuthError", (e) => ...)
Effect.catchTag("TunnelNotFoundError", (e) => ...)
Effect.catchTags({ TunnelApiError: ..., TunnelAuthError: ... })
```

---

## Schemas — `effect/schemas.ts`

Replace the raw TypeScript interfaces + Zod with `Schema.Class` and plain `Schema.Struct` for API response shapes. These are the domain types shared across services.

```ts
import { Schema } from "effect"

// ─── Cloudflare API response types (wire format) ───

export class CfTunnelConnection extends Schema.Class<CfTunnelConnection>("CfTunnelConnection")({
  id: Schema.String,
  colo_name: Schema.String,
  origin_ip: Schema.String,
  opened_at: Schema.String,
  client_version: Schema.String,
  is_pending_reconnect: Schema.Boolean,
}) {}

export class CfTunnel extends Schema.Class<CfTunnel>("CfTunnel")({
  id: Schema.String,
  name: Schema.String,
  status: Schema.String,
  created_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
  remote_config: Schema.Boolean,
  connections: Schema.Array(CfTunnelConnection),
}) {}

export class CfDnsRecord extends Schema.Class<CfDnsRecord>("CfDnsRecord")({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  content: Schema.String,
  proxied: Schema.Boolean,
  ttl: Schema.Number,
}) {}

export class CfZone extends Schema.Class<CfZone>("CfZone")({
  id: Schema.String,
  name: Schema.String,
  status: Schema.String,
}) {}

export class CfRoute extends Schema.Class<CfRoute>("CfRoute")({
  id: Schema.String,
  network: Schema.String,
  tunnel_id: Schema.String,
  tunnel_name: Schema.optional(Schema.String),
  virtual_network_id: Schema.optional(Schema.String),
  comment: Schema.optional(Schema.String),
  created_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
}) {}

export class CfVirtualNetwork extends Schema.Class<CfVirtualNetwork>("CfVirtualNetwork")({
  id: Schema.String,
  name: Schema.String,
  is_default_network: Schema.Boolean,
  comment: Schema.optional(Schema.String),
  created_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
}) {}

export class CfIngressRule extends Schema.Class<CfIngressRule>("CfIngressRule")({
  hostname: Schema.optional(Schema.String),
  service: Schema.String,
  path: Schema.optional(Schema.String),
  originRequest: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

export class CfTunnelConfig extends Schema.Class<CfTunnelConfig>("CfTunnelConfig")({
  config: Schema.Struct({
    ingress: Schema.Array(CfIngressRule),
    "warp-routing": Schema.optional(Schema.Struct({
      enabled: Schema.optional(Schema.Boolean),
    })),
    originRequest: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  }),
}) {}

// ─── SDK domain types (public-facing) ───

export class TunnelConnection extends Schema.Class<TunnelConnection>("TunnelConnection")({
  id: Schema.String,
  colo: Schema.String,
  ip: Schema.String,
  location: Schema.String,
  openedAt: Schema.DateFromString,
  clientVersion: Schema.String,
  isPendingReconnect: Schema.Boolean,
}) {}

export const TunnelStatus = Schema.Literal("healthy", "inactive", "degraded", "down")
export type TunnelStatus = typeof TunnelStatus.Type

export class TunnelInfo extends Schema.Class<TunnelInfo>("TunnelInfo")({
  id: Schema.String,
  name: Schema.String,
  status: TunnelStatus,
  createdAt: Schema.DateFromString,
  deletedAt: Schema.NullOr(Schema.DateFromString),
  connections: Schema.Array(TunnelConnection),
  remoteConfig: Schema.Boolean,
}) {}

export class IngressRule extends Schema.Class<IngressRule>("IngressRule")({
  hostname: Schema.optional(Schema.String),
  service: Schema.String,
  path: Schema.optional(Schema.String),
  originRequest: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

export class Route extends Schema.Class<Route>("Route")({
  network: Schema.String,
  tunnelId: Schema.String,
  tunnelName: Schema.optional(Schema.String),
  vnet: Schema.String,
  comment: Schema.optional(Schema.String),
}) {}

export class RouteCheckResult extends Schema.Class<RouteCheckResult>("RouteCheckResult")({
  tunnel: Schema.String,
  route: Schema.String,
  vnet: Schema.String,
}) {}

export class DnsRecord extends Schema.Class<DnsRecord>("DnsRecord")({
  hostname: Schema.String,
  type: Schema.String,
  content: Schema.String,
}) {}

export class VNet extends Schema.Class<VNet>("VNet")({
  id: Schema.String,
  name: Schema.String,
  isDefault: Schema.Boolean,
  comment: Schema.optional(Schema.String),
}) {}

export class ConnectorInfo extends Schema.Class<ConnectorInfo>("ConnectorInfo")({
  id: Schema.String,
  colo: Schema.String,
  ip: Schema.String,
  location: Schema.String,
}) {}

export class TunnelMetrics extends Schema.Class<TunnelMetrics>("TunnelMetrics")({
  rps: Schema.Number,
  p50Ms: Schema.Number,
  p99Ms: Schema.Number,
  activeConns: Schema.Number,
  bytesIn: Schema.Number,
  bytesOut: Schema.Number,
}) {}

export class LogEntry extends Schema.Class<LogEntry>("LogEntry")({
  timestamp: Schema.Date,
  level: Schema.Literal("info", "warn", "error", "debug"),
  event: Schema.String,
  message: Schema.String,
  connectorId: Schema.optional(Schema.String),
}) {}
```

---

## Services

### 1. `CloudflareApi` — HTTP Client Service

Replaces `ApiClient` class and `IApiClient` interface. Built on top of `HttpClient` from `effect/unstable/http` instead of raw fetch.

```ts
import { Effect, Layer, Schema, ServiceMap, Stream } from "effect"
import { TunnelApiError, TunnelAuthError, TunnelSdkError } from "../errors.js"

// ─── Service definition ───

export class CloudflareApi extends ServiceMap.Service<CloudflareApi, {
  get<T>(path: string, params?: Record<string, string>): Effect.Effect<T, TunnelApiError | TunnelAuthError>
  post<T>(path: string, body?: unknown): Effect.Effect<T, TunnelApiError | TunnelAuthError>
  put<T>(path: string, body?: unknown): Effect.Effect<T, TunnelApiError | TunnelAuthError>
  delete<T>(path: string, params?: Record<string, string>): Effect.Effect<T, TunnelApiError | TunnelAuthError>
  paginate<T>(path: string, params?: Record<string, string>): Stream.Stream<T, TunnelApiError | TunnelAuthError>
  accountPath(path: string): string
  zonePath(zoneId: string, path: string): string
}>()("tunnels/CloudflareApi") {

  static layer(config: {
    accountId: string
    apiToken: string
    baseUrl?: string
  }): Layer.Layer<CloudflareApi> {
    return Layer.effect(
      CloudflareApi,
      Effect.gen(function*() {
        const baseUrl = config.baseUrl ?? "https://api.cloudflare.com/client/v4"

        // ... request helper using Effect.tryPromise wrapping fetch ...
        // ... paginate returns Stream.paginate(...) ...

        return CloudflareApi.of({
          get: Effect.fn("CloudflareApi.get")(function*<T>(path: string, params?: Record<string, string>) {
            // build URL, call fetch, decode CfApiResponse, handle errors
          }),
          post: ...,
          put: ...,
          delete: ...,
          paginate: (path, params) => Stream.paginate(1, Effect.fn(function*(page) {
            // fetch page, yield items, return Option.some(page+1) or Option.none()
          })),
          accountPath: (path) => `/accounts/${config.accountId}${path}`,
          zonePath: (zoneId, path) => `/zones/${zoneId}${path}`,
        })
      })
    )
  }
}
```

**Key change**: `paginate` returns `Stream.Stream<T, E>` instead of `AsyncGenerator<T>`. This enables composable stream operations (map, filter, take, buffer, etc.) on paginated API results.

### 2. `TunnelOperations` — Tunnel CRUD

Replaces the `TunnelOperations` class. Returns `TunnelInfo` data objects instead of mutable `Tunnel` class instances. Sub-resource operations (ingress, dns, routes) are separate services that take a tunnel ID.

```ts
export class TunnelOperations extends ServiceMap.Service<TunnelOperations, {
  create(name: string, options?: CreateTunnelOptions): Effect.Effect<TunnelInfo, TunnelApiError | TunnelAuthError>
  list(options?: TunnelListOptions): Effect.Effect<ReadonlyArray<TunnelInfo>, TunnelApiError | TunnelAuthError>
  listAll(): Stream.Stream<TunnelInfo, TunnelApiError | TunnelAuthError>
  get(nameOrId: string): Effect.Effect<TunnelInfo, TunnelApiError | TunnelAuthError | TunnelNotFoundError>
  delete(nameOrId: string, options?: DeleteOptions): Effect.Effect<void, TunnelApiError | TunnelAuthError | TunnelNotFoundError>
  getToken(tunnelId: string): Effect.Effect<string, TunnelApiError | TunnelAuthError>
  refresh(tunnelId: string): Effect.Effect<TunnelInfo, TunnelApiError | TunnelAuthError>
}>()("tunnels/TunnelOperations") {

  static readonly layer: Layer.Layer<TunnelOperations, never, CloudflareApi> =
    Layer.effect(
      TunnelOperations,
      Effect.gen(function*() {
        const api = yield* CloudflareApi
        // ... implement using api.get, api.post, etc.
        return TunnelOperations.of({ create, list, listAll, get, delete: del, getToken, refresh })
      })
    )
}
```

**Key design change**: The old SDK used a mutable `Tunnel` class that held both data and behavior. In Effect, we separate data (`TunnelInfo`) from operations (services). This is cleaner because:
- `TunnelInfo` is a plain immutable value — safe to pass around, serialize, log
- Operations are explicit about their dependencies via the service requirement
- No hidden state mutations

### 3. `IngressManager` — Ingress Rules

```ts
export class IngressManager extends ServiceMap.Service<IngressManager, {
  list(tunnelId: string): Effect.Effect<ReadonlyArray<IngressRule>, TunnelApiError | TunnelAuthError>
  add(tunnelId: string, rule: IngressRule): Effect.Effect<void, TunnelApiError | TunnelAuthError>
  remove(tunnelId: string, hostname: string): Effect.Effect<void, TunnelApiError | TunnelAuthError | TunnelSdkError>
  set(tunnelId: string, rules: ReadonlyArray<IngressRule>): Effect.Effect<void, TunnelApiError | TunnelAuthError>
}>()("tunnels/IngressManager") {

  static readonly layer: Layer.Layer<IngressManager, never, CloudflareApi> = ...
}
```

### 4. `DnsManager` — DNS Records

Uses `Cache` for zone ID lookups — replaces the bare `Map<string, string>` with TTL + capacity.

```ts
export class DnsManager extends ServiceMap.Service<DnsManager, {
  ensure(tunnelId: string, hostname: string, options?: DnsEnsureOptions): Effect.Effect<void, TunnelApiError | TunnelAuthError | TunnelSdkError>
  remove(tunnelId: string, hostname: string): Effect.Effect<void, TunnelApiError | TunnelAuthError>
  list(tunnelId: string): Effect.Effect<ReadonlyArray<DnsRecord>, TunnelApiError | TunnelAuthError>
}>()("tunnels/DnsManager") {

  static readonly layer: Layer.Layer<DnsManager, never, CloudflareApi> = Layer.effect(
    DnsManager,
    Effect.gen(function*() {
      const api = yield* CloudflareApi

      // Cache replaces the bare Map<string, string> — adds TTL + capacity bound
      const zoneCache = yield* Cache.make<string, string, TunnelApiError | TunnelAuthError>({
        capacity: 100,
        timeToLive: Duration.minutes(10),
        lookup: (hostname: string) => resolveZoneId(api, hostname),
      })

      // ... ensure, remove, list using zoneCache ...
      return DnsManager.of({ ensure, remove, list })
    })
  )
}
```

### 5. `RouteManager` — Private Network Routes

```ts
export class RouteManager extends ServiceMap.Service<RouteManager, {
  add(tunnelId: string, network: string, options?: RouteAddOptions): Effect.Effect<void, TunnelApiError | TunnelAuthError>
  remove(tunnelId: string, network: string): Effect.Effect<void, TunnelApiError | TunnelAuthError | TunnelSdkError>
  list(tunnelId: string): Effect.Effect<ReadonlyArray<Route>, TunnelApiError | TunnelAuthError>
  check(tunnelId: string, ip: string): Effect.Effect<RouteCheckResult | null, TunnelApiError | TunnelAuthError>
}>()("tunnels/RouteManager") {

  static readonly layer: Layer.Layer<RouteManager, never, CloudflareApi> = ...
}
```

### 6. `VNetManager` — Virtual Networks

```ts
export class VNetManager extends ServiceMap.Service<VNetManager, {
  create(name: string, options?: VNetCreateOptions): Effect.Effect<VNet, TunnelApiError | TunnelAuthError>
  delete(name: string): Effect.Effect<void, TunnelApiError | TunnelAuthError | TunnelSdkError>
  list(): Effect.Effect<ReadonlyArray<VNet>, TunnelApiError | TunnelAuthError>
}>()("tunnels/VNetManager") {

  static readonly layer: Layer.Layer<VNetManager, never, CloudflareApi> = ...
}
```

### 7. `CloudflaredBinary` — Binary Management

Wraps the existing `cloudflared.ts` binary resolver into a proper service. Uses `Effect.tryPromise` around the existing install/check logic.

```ts
export class CloudflaredBinary extends ServiceMap.Service<CloudflaredBinary, {
  readonly path: Effect.Effect<string, BinaryInstallError>
  ensureInstalled(): Effect.Effect<string, BinaryInstallError>
  install(version?: string): Effect.Effect<void, BinaryInstallError>
  isInstalled(): Effect.Effect<boolean>
}>()("tunnels/CloudflaredBinary") {

  // Default layer wraps the existing cloudflared module
  static readonly layer: Layer.Layer<CloudflaredBinary> = Layer.effect(
    CloudflaredBinary,
    Effect.gen(function*() {
      const resolver = yield* loadCloudflaredResolver

      const ensureInstalled = Effect.fn("CloudflaredBinary.ensureInstalled")(function*() {
        const installed = yield* Effect.tryPromise({
          try: () => resolver.isInstalled(),
          catch: (cause) => new BinaryInstallError({ message: "Failed to check binary", cause }),
        })
        if (!installed) {
          yield* Effect.tryPromise({
            try: () => resolver.install(),
            catch: (cause) => new BinaryInstallError({ message: "Failed to install cloudflared", cause }),
          })
        }
        return resolver.path
      })

      return CloudflaredBinary.of({
        path: Effect.succeed(resolver.path),
        ensureInstalled,
        install: Effect.fn("CloudflaredBinary.install")(function*(version?: string) {
          yield* Effect.tryPromise({
            try: () => resolver.install(version ? { version } : undefined),
            catch: (cause) => new BinaryInstallError({ message: "Install failed", cause }),
          })
        }),
        isInstalled: Effect.tryPromise({
          try: () => resolver.isInstalled(),
          catch: () => false,  // swallow — just report not installed
        }),
      })
    })
  )
}
```

### 8. `TunnelProcess` — Running cloudflared

This is the most interesting service. The current `TunnelProcess` class uses EventEmitter + manual process management. In Effect, we use:

- **`ChildProcess` + `ChildProcessSpawner`** — Effect's built-in process management (auto-kill on scope close)
- **`SubscriptionRef<TunnelStatus>`** — mutable status with change stream (replaces EventEmitter + statusValue field)
- **`Stream`** from `handle.stderr` — already a `Stream<Uint8Array>`, decode + split + parse into events
- **`Scope`** — process is killed when scope closes, no manual SIGTERM/SIGKILL dance

```ts
import { Effect, Layer, Schema, ServiceMap, Stream, SubscriptionRef } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

// Union type for all process events
export type TunnelEvent =
  | { readonly _tag: "Connected"; readonly connector: ConnectorInfo }
  | { readonly _tag: "Disconnected"; readonly connector: ConnectorInfo }
  | { readonly _tag: "Reconnecting"; readonly attempt: ReconnectAttempt }
  | { readonly _tag: "Error"; readonly error: TunnelError }
  | { readonly _tag: "Metrics"; readonly metrics: TunnelMetrics }
  | { readonly _tag: "Status"; readonly status: TunnelStatus }

export interface RunningTunnel {
  readonly events: Stream.Stream<TunnelEvent>
  readonly logs: Stream.Stream<LogEntry>
  readonly status: Effect.Effect<TunnelStatus>
  readonly connectors: Effect.Effect<ReadonlyArray<ConnectorInfo>>
  readonly waitUntilHealthy: Effect.Effect<void, TunnelProcessError>
  readonly exitCode: Effect.Effect<number>
}

export interface RunOptions {
  readonly metrics?: string
  readonly logLevel?: "debug" | "info" | "warn" | "error"
  readonly gracePeriod?: string
  readonly retries?: number
}

export class TunnelProcessService extends ServiceMap.Service<TunnelProcessService, {
  // Returns a Scoped RunningTunnel — process is killed when scope closes
  run(token: string, options?: RunOptions): Effect.Effect<RunningTunnel, TunnelProcessError, Scope>
}>()("tunnels/TunnelProcess") {

  static readonly layer: Layer.Layer<
    TunnelProcessService, never,
    ChildProcessSpawner.ChildProcessSpawner | CloudflaredBinary
  > = Layer.effect(
      TunnelProcessService,
      Effect.gen(function*() {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
        const binary = yield* CloudflaredBinary

        const run = Effect.fn("TunnelProcess.run")(
          function*(token: string, options?: RunOptions): Effect.fn.Return<RunningTunnel, TunnelProcessError, Scope> {
            const binaryPath = yield* binary.ensureInstalled()

            // Build command using ChildProcess.make — composable AST
            const command = ChildProcess.make(binaryPath, buildArgs(token, options))

            // spawn returns a ChildProcessHandle, scoped to current Scope
            // Process is automatically killed when scope closes — no manual SIGTERM/SIGKILL
            const handle = yield* spawner.spawn(command).pipe(
              Effect.mapError((cause) => new TunnelProcessError({ message: "Failed to spawn cloudflared", cause }))
            )

            // SubscriptionRef for status — replaces EventEmitter + private statusValue
            const statusRef = yield* SubscriptionRef.make<TunnelStatus>("inactive")
            const connectorsRef = yield* SubscriptionRef.make<ReadonlyArray<ConnectorInfo>>([])

            // Parse stderr lines into TunnelEvents
            // handle.stderr is already Stream<Uint8Array> — no readline needed
            const stderrLines = handle.stderr.pipe(Stream.decodeText(), Stream.splitLines)

            // Fork a fiber that parses lines and updates statusRef/connectorsRef
            const events: Stream.Stream<TunnelEvent> = stderrLines.pipe(
              Stream.mapEffect((line) => parseLine(line, statusRef, connectorsRef)),
              Stream.filterMap(identity), // skip unparseable lines
            )

            // Logs are the same stderr lines parsed into LogEntry
            const logs: Stream.Stream<LogEntry> = stderrLines.pipe(
              Stream.map(parseLogEntry),
              Stream.filterMap(identity),
            )

            // waitUntilHealthy — listen to the SubscriptionRef change stream
            const waitUntilHealthy = SubscriptionRef.changes(statusRef).pipe(
              Stream.filter((s) => s === "healthy"),
              Stream.take(1),
              Stream.runDrain,
              Effect.timeoutFail({
                duration: "60 seconds",
                onTimeout: () => new TunnelProcessError({ message: "Timed out waiting for healthy" }),
              }),
            )

            return {
              events,
              logs,
              status: SubscriptionRef.get(statusRef),
              connectors: SubscriptionRef.get(connectorsRef),
              waitUntilHealthy,
              exitCode: handle.exitCode.pipe(
                Effect.map((code) => code as number),
                Effect.mapError((cause) => new TunnelProcessError({ message: "Process error", cause })),
              ),
            } satisfies RunningTunnel
          }
        )

        return TunnelProcessService.of({ run })
      })
    )
}
```

### `expose` — Quick Anonymous Tunnels

Uses `ChildProcessSpawner` like `TunnelProcessService`:

```ts
// effect/expose.ts
export const expose = Effect.fn("expose")(
  function*(port: number): Effect.fn.Return<{ readonly url: string }, TunnelProcessError | BinaryInstallError, Scope> {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const binary = yield* CloudflaredBinary
    const binaryPath = yield* binary.ensureInstalled()

    // ChildProcess.make builds the command, spawner.spawn runs it — scoped
    const command = ChildProcess.make(binaryPath, ["tunnel", "--url", `http://localhost:${port}`])
    const handle = yield* spawner.spawn(command).pipe(
      Effect.mapError((cause) => new TunnelProcessError({ message: "Failed to spawn", cause }))
    )

    // Wait for URL from stderr stream — no readline, no callbacks
    const url = yield* handle.stderr.pipe(
      Stream.decodeText(),
      Stream.splitLines,
      Stream.filterMap((line) => {
        const match = line.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/)
        return match ? Option.some(match[1]) : Option.none()
      }),
      Stream.take(1),
      Stream.runHead,
      Effect.flatten,
      Effect.timeoutFail({
        duration: "30 seconds",
        onTimeout: () => new TunnelProcessError({ message: "Timed out waiting for tunnel URL" }),
      }),
    )

    return { url }
  }
)
```

Usage:
```ts
import { NodeServices } from "@effect/platform-node"

// Effect consumer
const program = Effect.gen(function*() {
  const { url } = yield* expose(3000)
  yield* Effect.log(`Tunnel live at ${url}`)
  yield* Effect.never  // keep alive until scope closes
}).pipe(
  Effect.scoped,
  Effect.provide(Layer.mergeAll(CloudflaredBinary.layer, NodeServices.layer))
)
```

---

## Config — `effect/config.ts`

Replace Zod schemas with Effect `Schema`. The `TunnelConfig.parse` / `safeParse` pattern becomes Effect-native:

```ts
import { Schema, Effect } from "effect"
import { ConfigValidationError } from "./errors.js"

const DurationString = Schema.String.pipe(
  Schema.pattern(/^(\d+(\.\d+)?)\s*(ns|us|µs|ms|s|m|h)$/)
)

const ServiceUrl = Schema.String  // + refinement

export class OriginRequest extends Schema.Class<OriginRequest>("OriginRequest")({
  connectTimeout: Schema.optional(DurationString),
  tlsTimeout: Schema.optional(DurationString),
  // ... all fields from current schema
}) {}

export class IngressRuleConfig extends Schema.Class<IngressRuleConfig>("IngressRuleConfig")({
  hostname: Schema.optional(Schema.String),
  service: ServiceUrl,
  path: Schema.optional(Schema.String),
  originRequest: Schema.optional(OriginRequest),
}) {}

export class TunnelConfigInput extends Schema.Class<TunnelConfigInput>("TunnelConfigInput")({
  tunnel: Schema.optional(Schema.String),
  ingress: Schema.NonEmptyArray(IngressRuleConfig),
  autoFallback: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  dns: Schema.optional(Schema.Struct({
    auto: Schema.optional(Schema.Boolean),
    cleanup: Schema.optional(Schema.Boolean),
  })),
  routes: Schema.optional(Schema.Array(Schema.Struct({
    network: Schema.String.pipe(Schema.pattern(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/)),
    vnet: Schema.optional(Schema.String),
    comment: Schema.optional(Schema.String),
  }))),
  warpRouting: Schema.optional(Schema.Struct({
    enabled: Schema.optional(Schema.Boolean),
  })),
  originRequest: Schema.optional(OriginRequest),
}) {}

// Effectful parse with duplicate hostname + catch-all validation
export const parseConfig = Effect.fn("TunnelConfig.parse")(
  function*(input: typeof TunnelConfigInput.Encoded): Effect.fn.Return<TunnelConfigInput, ConfigValidationError> {
    const decoded = yield* Schema.decode(TunnelConfigInput)(input).pipe(
      Effect.mapError((e) => new ConfigValidationError({
        message: "Invalid tunnel config",
        issues: [...],  // map ParseError to our issue format
      }))
    )
    // Custom validations: duplicate hostnames, catch-all rule, etc.
    // Return with auto-appended catch-all if needed
    return decoded
  }
)

// YAML parsing
export const parseConfigFromYaml = Effect.fn("TunnelConfig.fromYaml")(
  function*(yaml: string): Effect.fn.Return<TunnelConfigInput, ConfigValidationError> {
    const parsed = yield* Effect.try({
      try: () => parseYaml(yaml),
      catch: (cause) => new ConfigValidationError({ message: "Invalid YAML", issues: [], cause }),
    })
    return yield* parseConfig(parsed)
  }
)
```

---

## Layers — Composition

### `Live.ts` — Production Layer

```ts
import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { NodeServices } from "@effect/platform-node"

// All services wired together for production use
export const LiveLayer = (config: CloudflareApiConfig) => Layer.mergeAll(
  TunnelOperations.layer,
  IngressManager.layer,
  DnsManager.layer,
  RouteManager.layer,
  VNetManager.layer,
  TunnelProcessService.layer,
  CloudflaredBinary.layer,
).pipe(
  Layer.provide(CloudflareApi.layer(config)),
  Layer.provide(FetchHttpClient.layer),      // HttpClient for CloudflareApi
  Layer.provide(NodeServices.layer),          // ChildProcessSpawner for TunnelProcess + expose
)

// From environment (no explicit config needed)
export const LiveLayerFromEnv = Layer.mergeAll(
  TunnelOperations.layer,
  IngressManager.layer,
  DnsManager.layer,
  RouteManager.layer,
  VNetManager.layer,
  TunnelProcessService.layer,
  CloudflaredBinary.layer,
).pipe(
  Layer.provide(CloudflareApi.layerFromEnv),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(NodeServices.layer),
)
```

### `Test.ts` — Test Layer

```ts
export const TestLayer = Layer.mergeAll(
  // Stub implementations that return canned data or fail with descriptive errors
  Layer.succeed(CloudflareApi, { ... }),
  Layer.succeed(TunnelOperations, { ... }),
  Layer.succeed(CloudflaredBinary, { ... }),
  // etc.
)
```

---

## Entry Point: `tunnels/effect` (`effect/index.ts`)

```ts
// ─── Errors ───
export {
  TunnelSdkError,
  TunnelApiError,
  TunnelAuthError,
  TunnelNotFoundError,
  TunnelProcessError,
  BinaryInstallError,
  ConfigValidationError,
} from "./errors.js"

// ─── Schemas / Domain types ───
export {
  TunnelInfo,
  TunnelConnection,
  TunnelStatus,
  IngressRule,
  Route,
  RouteCheckResult,
  DnsRecord,
  VNet,
  ConnectorInfo,
  TunnelMetrics,
  LogEntry,
} from "./schemas.js"

// ─── Services ───
export { CloudflareApi } from "./services/CloudflareApi.js"
export { TunnelOperations } from "./services/TunnelOperations.js"
export { IngressManager } from "./services/IngressManager.js"
export { DnsManager } from "./services/DnsManager.js"
export { RouteManager } from "./services/RouteManager.js"
export { VNetManager } from "./services/VNetManager.js"
export { CloudflaredBinary } from "./services/CloudflaredBinary.js"
export { TunnelProcessService } from "./services/TunnelProcess.js"
export type { RunningTunnel, TunnelEvent, RunOptions } from "./services/TunnelProcess.js"

// ─── Top-level Effects ───
export { expose } from "./expose.js"

// ─── Config ───
export { parseConfig, parseConfigFromYaml, TunnelConfigInput, OriginRequest } from "./config.js"

// ─── Layers ───
export { LiveLayer } from "./layers/Live.js"
export { TestLayer } from "./layers/Test.js"
```

### Usage from Effect consumers

```ts
import { Effect, Stream } from "effect"
import {
  TunnelOperations,
  IngressManager,
  DnsManager,
  TunnelProcessService,
  LiveLayer,
} from "tunnels/effect"

const program = Effect.gen(function*() {
  const tunnels = yield* TunnelOperations
  const ingress = yield* IngressManager
  const dns = yield* DnsManager
  const process = yield* TunnelProcessService

  // Create a tunnel
  const tunnel = yield* tunnels.create("my-app", {
    ingress: [
      { hostname: "app.example.com", service: "http://localhost:3000" },
    ],
  })

  // Set up ingress + DNS
  yield* ingress.set(tunnel.id, [
    { hostname: "app.example.com", service: "http://localhost:3000" },
    { hostname: "api.example.com", service: "http://localhost:8080" },
  ])
  yield* dns.ensure(tunnel.id, "app.example.com")
  yield* dns.ensure(tunnel.id, "api.example.com")

  // Get a token and run
  const token = yield* tunnels.getToken(tunnel.id)
  const running = yield* process.run(token)

  yield* running.waitUntilHealthy

  // Stream events
  yield* running.events.pipe(
    Stream.filter((e) => e._tag === "Metrics"),
    Stream.runForEach((e) =>
      Effect.log(`${e.metrics.rps} req/s — p50: ${e.metrics.p50Ms}ms`)
    ),
    Effect.fork,
  )

  yield* running.exitCode
}).pipe(
  Effect.scoped,
  Effect.provide(LiveLayer({
    accountId: process.env.CF_ACCOUNT_ID!,
    apiToken: process.env.CF_API_TOKEN!,
  }))
)
```

---

## Entry Point: `tunnels` (`index.ts`) — Async/Await Wrapper

Thin wrapper that creates a `ManagedRuntime` internally and exposes the same API shape consumers have today. Zero Effect knowledge required.

```ts
import { Effect, Layer, ManagedRuntime, Stream } from "effect"
import {
  CloudflareApi,
  TunnelOperations as TunnelOpsService,
  IngressManager as IngressService,
  DnsManager as DnsService,
  RouteManager as RouteService,
  VNetManager as VNetService,
  TunnelProcessService,
  CloudflaredBinary,
  LiveLayer,
  expose as exposeEffect,
} from "./effect/index.js"
import type {
  TunnelInfo,
  IngressRule,
  Route,
  DnsRecord,
  VNet,
  RunOptions,
  TunnelStatus,
  ConnectorInfo,
  LogEntry,
} from "./effect/index.js"

// ─── Re-export types ───
export type {
  TunnelInfo,
  IngressRule,
  Route,
  DnsRecord,
  VNet,
  RunOptions,
  TunnelStatus,
  ConnectorInfo,
  LogEntry,
}

// ─── TunnelClient (async/await facade) ───

export interface TunnelClientOptions {
  accountId: string
  apiToken: string
  baseUrl?: string
}

export class TunnelClient {
  private readonly runtime: ManagedRuntime.ManagedRuntime<
    TunnelOpsService | IngressService | DnsService | RouteService | VNetService | TunnelProcessService | CloudflaredBinary
  >

  readonly tunnels: TunnelClientTunnels
  readonly vnets: TunnelClientVNets

  constructor(options: TunnelClientOptions) {
    this.runtime = ManagedRuntime.make(LiveLayer(options))

    this.tunnels = new TunnelClientTunnels(this.runtime)
    this.vnets = new TunnelClientVNets(this.runtime)
  }

  async dispose(): Promise<void> {
    await this.runtime.dispose()
  }
}

class TunnelClientTunnels {
  constructor(private readonly runtime: ManagedRuntime.ManagedRuntime<any>) {}

  async create(name: string, options?: CreateTunnelOptions): Promise<TunnelInfo> {
    return this.runtime.runPromise(
      TunnelOpsService.use((svc) => svc.create(name, options))
    )
  }

  async list(options?: TunnelListOptions): Promise<TunnelInfo[]> {
    return this.runtime.runPromise(
      TunnelOpsService.use((svc) => svc.list(options))
    ).then((a) => [...a])
  }

  async get(nameOrId: string): Promise<TunnelInfo> {
    return this.runtime.runPromise(
      TunnelOpsService.use((svc) => svc.get(nameOrId))
    )
  }

  async delete(nameOrId: string, options?: DeleteOptions): Promise<void> {
    return this.runtime.runPromise(
      TunnelOpsService.use((svc) => svc.delete(nameOrId, options))
    )
  }

  // ... listAll returns AsyncGenerator by collecting from Stream
}

class TunnelClientVNets {
  constructor(private readonly runtime: ManagedRuntime.ManagedRuntime<any>) {}

  async create(name: string, options?: VNetCreateOptions): Promise<VNet> {
    return this.runtime.runPromise(
      VNetService.use((svc) => svc.create(name, options))
    )
  }
  // ... list, delete
}

// ─── expose() wrapper ───

export async function expose(port: number): Promise<{
  readonly url: string
  close(): Promise<void>
  [Symbol.asyncDispose](): Promise<void>
}> {
  const runtime = ManagedRuntime.make(CloudflaredBinary.layer)
  const result = await runtime.runPromise(
    exposeEffect(port).pipe(Effect.scoped)
  )
  // ... wrap with close/dispose that calls runtime.dispose()
}

// ─── Config re-export (pure, no Effect needed) ───
export { TunnelConfig } from "./effect/config.js"
```

---

## Migration Path for `tunnels` CLI

The `tunnels` CLI's `LiveLayer` (currently all `notImplemented` stubs) gets replaced with the real `tunnels/effect` services:

```ts
// packages/cli/src/live-layer.ts — AFTER
import { Layer } from "effect"
import {
  LiveLayer as SdkLiveLayer,
  TunnelOperations,
  // ...
} from "tunnels/effect"

// Adapter layers that bridge the CLI service interfaces to the SDK services
// (or refactor CLI services to directly use SDK services)

export const LiveLayer = SdkLiveLayer({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: process.env.CF_API_TOKEN!,
}).pipe(
  Layer.provideMerge(/* CLI-specific services like ConfigService, AuthService */)
)
```

---

## Dependency Changes

```jsonc
// packages/tunnels/package.json
{
  "dependencies": {
    "effect": "beta",             // NEW — replaces zod for schemas + runtime
    "@effect/platform-node": "beta",  // NodeStream, NodeChildProcessSpawner
    "yaml": "^2.7.1"             // kept for YAML parsing
    // zod: REMOVED
  },
  "devDependencies": {
    "@effect/vitest": "beta"      // NEW — it.effect, layer() test helpers
  },
  "exports": {
    ".": { ... },           // async/await wrapper
    "./effect": {           // pure Effect API
      "types": { "import": "./dist/effect/index.d.mts" },
      "import": "./dist/effect/index.mjs"
    },
    "./bin": { ... }        // unchanged
  }
}
```

---

## What Changes for Consumers

| Today | After |
|---|---|
| `new TunnelClient(opts)` | `new TunnelClient(opts)` — same API |
| `await client.tunnels.create(...)` | Same — wrapper delegates to Effect |
| `tunnel.ingress.add(rule)` | `client.tunnels.get(id)` → then `ingress.add(tunnelId, rule)` (flat, not nested on tunnel object) |
| `await expose(3000)` | Same API, same `using` support |
| Zod errors | `TunnelApiError`, `ConfigValidationError` etc. with `_tag` |
| `for await (const entry of tunnel.logs())` | Same in wrapper; `Stream<LogEntry>` in Effect API |
| EventEmitter `.on("connected", ...)` | Same in wrapper; `Stream<TunnelEvent>` in Effect API |

### Breaking change in wrapper: flat sub-resource API

The old pattern was `tunnel.ingress.add(rule)` where `tunnel` was a mutable class holding managers. The new wrapper's `TunnelInfo` is a plain data object. Sub-resource operations move to the client level:

```ts
// Old
const tunnel = await client.tunnels.get("my-app")
await tunnel.ingress.add({ hostname: "...", service: "..." })

// New
const tunnel = await client.tunnels.get("my-app")
await client.ingress.add(tunnel.id, { hostname: "...", service: "..." })
// Or:
await client.tunnels.ingress.add(tunnel.id, { hostname: "...", service: "..." })
```

This is a deliberate trade — immutable data + explicit service access is cleaner and matches Effect idioms.

---

## Effect Utilities Audit — What to Adopt and Why

After a full sweep of the effect-smol codebase (`packages/effect/src/`, `packages/platform-node/`,
`unstable/` modules, and all ai-docs examples), here's what's worth adopting — and what isn't.

### ✅ ADOPT: `HttpClient` + `FetchHttpClient` — replaces our hand-rolled `ApiClient`

**Where**: `effect/unstable/http` — `HttpClient`, `HttpClientRequest`, `HttpClientResponse`, `FetchHttpClient`

**Why this is a clear win**: Our current `ApiClient` is ~120 lines of hand-rolled fetch wrapper
(headers, JSON parsing, error mapping, URL building). `HttpClient` gives us all of that plus:

- **`HttpClient.mapRequest`** — set base URL + auth header once on the client, applies to every request
- **`HttpClient.filterStatusOk`** — auto-fails on non-2xx (we hand-code this in `throwApiError`)
- **`HttpClient.retryTransient`** — exponential backoff on 429/5xx/network errors. Our SDK currently
  has *zero* retry logic. The Cloudflare API rate-limits aggressively; this is a real reliability gap.
- **`HttpClientResponse.schemaBodyJson(CfApiResponse)`** — decode + validate response bodies with
  our Schema types in one combinator. No more `as CfApiResponse<T>` type assertions.
- **`HttpClientResponse.matchStatus`** — pattern-match on `401`/`403`/`"4xx"`/`"5xx"` to map to
  our error types, cleaner than the current `if (status === 401 || status === 403)` chain.
- **`FetchHttpClient.layer`** — injectable fetch implementation. Consumers can provide their own
  fetch (e.g. for testing, proxies, or Cloudflare Workers environment). The current SDK takes
  `fetch?: typeof globalThis.fetch` as a constructor option — HttpClient handles this via Layer.

**Concrete change to plan**: `CloudflareApi` service takes `HttpClient` as a dependency instead of
wrapping raw fetch. The layer composes `FetchHttpClient.layer` underneath.

```ts
// Before (plan v1):
static layer(config: { accountId, apiToken, baseUrl? }): Layer.Layer<CloudflareApi>

// After:
static layer(config: { accountId, apiToken, baseUrl? }): Layer.Layer<CloudflareApi, never, HttpClient>

// Production assembly:
CloudflareApi.layer(config).pipe(Layer.provide(FetchHttpClient.layer))
```

This means consumers on Cloudflare Workers can swap in their own HttpClient layer instead of
FetchHttpClient, and test layers can provide a mock HttpClient without touching the network.

### ✅ ADOPT: `ChildProcess` + `ChildProcessSpawner` — replaces our manual `spawn` wrapper

**Where**: `effect/unstable/process` — `ChildProcess`, `ChildProcessSpawner`

**Why this matters**: Our `TunnelProcess` class and `expose()` both manually call `node:child_process.spawn`,
wire up readline on stderr, manage SIGTERM/SIGKILL timeouts, etc. The Effect `ChildProcess` module
gives us:

- **`ChildProcess.make("cloudflared", [...])`** — build a command value (AST-based, composable)
- **`spawner.spawn(command)`** — returns a `ChildProcessHandle` scoped to the current `Scope`
  - `handle.stderr` is already a `Stream.Stream<Uint8Array>` — no readline needed
  - `handle.exitCode` is an `Effect<ExitCode>` — no Promise wrapping
  - `handle.kill()` is an `Effect<void>` — no manual SIGTERM/SIGKILL dance
- **Scope-managed lifecycle** — process is automatically killed when the scope closes, which is
  exactly what `acquireRelease` gives us, but built-in
- **`Stream.decodeText` + `Stream.splitLines`** — replaces our `createInterface({ input: proc.stderr })`
  for line-by-line parsing

**Concrete change to plan**: `TunnelProcessService` and `expose` use `ChildProcessSpawner` instead
of raw `node:child_process`. Requires `NodeServices.layer` (or just `NodeChildProcessSpawner`) in
the production layer.

```ts
export class TunnelProcessService extends ServiceMap.Service<TunnelProcessService, {
  run(token: string, options?: RunOptions): Effect.Effect<RunningTunnel, TunnelProcessError, Scope>
}>()("tunnels/TunnelProcess") {
  // Depends on ChildProcessSpawner (and CloudflaredBinary for the path)
  static readonly layer: Layer.Layer<TunnelProcessService, never, ChildProcessSpawner | CloudflaredBinary> = ...
}
```

### ✅ ADOPT: `Config` + `Config.redacted` — for structured SDK configuration

**Where**: `effect/Config`

**Why it belongs**: Right now config is `{ accountId: string, apiToken: string, baseUrl?: string }`
passed as a plain object. Using `Config` gives us:

- **`Config.redacted("CF_API_TOKEN")`** — the API token is wrapped in `Redacted<string>`, so it
  never appears in logs, console.log, JSON.stringify, or error messages. Currently if someone
  logs the options object, the token is in plain text.
- **`Config.schema`** — validates the config struct at layer construction time with proper error
  messages ("missing CF_ACCOUNT_ID") instead of the current `if (!accountId) throw`
- **`Layer.unwrap`** — consumers can choose between explicit config (`CloudflareApi.layer({ ... })`)
  or env-based config (`CloudflareApi.layerFromEnv`) that reads from `ConfigProvider`

**Concrete change to plan**: Add a `CloudflareApiConfig` schema:

```ts
export class CloudflareApiConfig extends Schema.Class<CloudflareApiConfig>("CloudflareApiConfig")({
  accountId: Schema.NonEmptyString,
  apiToken: Schema.Redacted(Schema.NonEmptyString),
  baseUrl: Schema.optionalWith(Schema.String, {
    default: () => "https://api.cloudflare.com/client/v4",
  }),
}) {}

export class CloudflareApi extends ServiceMap.Service<...>()("tunnels/CloudflareApi") {
  // Explicit config (programmatic usage)
  static layer(config: CloudflareApiConfig): Layer.Layer<CloudflareApi, never, HttpClient>

  // From environment (CLI / server usage)
  static readonly layerFromEnv: Layer.Layer<CloudflareApi, Config.ConfigError, HttpClient>
    = Layer.unwrap(Effect.gen(function*() {
        const accountId = yield* Config.nonEmptyString("CF_ACCOUNT_ID")
        const apiToken  = yield* Config.redacted("CF_API_TOKEN")
        const baseUrl   = yield* Config.string("CF_BASE_URL").pipe(Config.withDefault("https://api.cloudflare.com/client/v4"))
        return CloudflareApi.layer(new CloudflareApiConfig({ accountId, apiToken, baseUrl }))
      }))
}
```

### ✅ ADOPT: `Cache` — for zone ID lookups in `DnsManager`

**Where**: `effect/Cache`

**Why**: The current `DnsManager` has `private readonly zoneIdCache = new Map<string, string>()`
for caching zone ID lookups. This is a mutable cache with no TTL, no capacity limit, and no
thread safety. `Cache` gives us:

- Automatic TTL (zones don't change often, but a 10-minute TTL prevents stale data)
- Capacity limit (prevents unbounded memory growth in long-running processes)
- Concurrent-safe (multiple fibers looking up different zones won't race)
- The lookup function is an Effect, so it integrates cleanly with the CloudflareApi service

```ts
const zoneCache = yield* Cache.make<string, string, TunnelApiError | TunnelAuthError>({
  capacity: 100,
  timeToLive: Duration.minutes(10),
  lookup: (hostname: string) => findZoneIdForHostname(api, hostname),
})
```

This is a small change but fixes a real correctness issue (no TTL) and a potential memory
leak (no capacity bound) in long-running tunnel processes.

### ✅ ADOPT: `SubscriptionRef` — for tunnel process status tracking

**Where**: `effect/SubscriptionRef`

**Why**: The current `TunnelProcess` tracks status via `private statusValue: TunnelStatus = "inactive"`
and emits changes via EventEmitter. In Effect, `SubscriptionRef` is exactly this pattern:

- `SubscriptionRef.make<TunnelStatus>("inactive")` — mutable ref with change stream
- `SubscriptionRef.changes(ref)` — returns `Stream<TunnelStatus>` of all updates
- `SubscriptionRef.get(ref)` — current value as `Effect<TunnelStatus>`
- `SubscriptionRef.set(ref, "healthy")` — update + broadcast in one atomic operation

This replaces both the `statusValue` field and the EventEmitter `status` event. The
`waitUntilHealthy` implementation becomes:

```ts
SubscriptionRef.changes(statusRef).pipe(
  Stream.filter((s) => s === "healthy"),
  Stream.take(1),
  Stream.runDrain,
  Effect.timeoutFail({ ... })
)
```

Same pattern for the connector map — use a `SubscriptionRef<ReadonlyArray<ConnectorInfo>>`.

### ✅ ADOPT: `@effect/vitest` — for testing

**Where**: `@effect/vitest`

**Why**: The project already uses vitest. `@effect/vitest` gives us:

- **`it.effect`** — run Effect programs as tests, automatic runtime management
- **`layer()`** — shared service layers across test suites (construct once, tear down in afterAll)
- **`it.effect.prop`** — property-based testing with Schema-derived arbitraries (useful for
  config validation, URL parsing, etc.)

This is a direct replacement for the current test files which would otherwise need manual
`Effect.runPromise` wrapping.

### ✅ ADOPT: `Effect.withSpan` / `Effect.annotateCurrentSpan` — observability hooks

**Where**: Built into `Effect` (and `Effect.fn` adds spans automatically)

**Why**: `Effect.fn("name")` already adds tracing spans. Adding `Effect.annotateCurrentSpan`
in key places (tunnel ID, hostname, network CIDR) gives consumers free distributed tracing
if they wire up an `OtlpTracer` layer. Zero cost if they don't — spans are no-ops without
a tracer. This is essentially free observability.

```ts
const create = Effect.fn("TunnelOperations.create")(function*(name: string, options?: CreateTunnelOptions) {
  yield* Effect.annotateCurrentSpan({ tunnelName: name })
  // ...
})
```

We're already getting this for free from `Effect.fn("name")` — just need to add annotations
where they'd be useful.

### ❌ SKIP: `PubSub` — overkill for process events

Our `TunnelEvent` stream is single-producer (one process), and consumers either want the
full stream or filtered views. `Stream.callback` + `Stream.share` handles this. PubSub is
for multi-consumer fan-out with backpressure strategies — more machinery than we need.

### ❌ SKIP: `RcMap` / `LayerMap` — no multi-tenant use case

These are for managing keyed resources (e.g., one DB connection per tenant). Our SDK manages
one tunnel at a time. If someone needs multiple tunnels, they compose multiple service
instances — no need for a resource map.

### ❌ SKIP: `Metric` module — not an SDK concern

Metrics (counters, histograms) are application-level concerns. The SDK already exposes
`TunnelMetrics` events from cloudflared; let consumers decide how to aggregate them.
Baking `Metric.counter("tunnel.api.requests")` into the SDK would couple it to a
metrics backend.

### ❌ SKIP: `Semaphore` — no concurrency throttling needed

The Cloudflare API rate-limits server-side. `HttpClient.retryTransient` handles 429s
with backoff. Adding a client-side semaphore to limit concurrency would be premature
optimization without measured need.

### ❌ SKIP: `Cluster` / `RPC` / `Workflow` / `Socket` / `SQL` / `AI` — unrelated domains

These are for distributed systems, databases, AI integrations, etc. None apply to a
tunnel management SDK.

---

## Implementation Order

1. **`effect/errors.ts`** — TaggedErrorClass definitions (no deps, fast)
2. **`effect/schemas.ts`** — Domain types as Schema classes
3. **`effect/config.ts`** — Port Zod → Effect Schema
4. **`effect/services/CloudflareApi.ts`** — HTTP service (core dependency for everything)
5. **`effect/services/VNetManager.ts`** — Simplest manager (good proof-of-concept)
6. **`effect/services/DnsManager.ts`**
7. **`effect/services/IngressManager.ts`**
8. **`effect/services/RouteManager.ts`**
9. **`effect/services/TunnelOperations.ts`** — Orchestrates above
10. **`effect/services/CloudflaredBinary.ts`** — Binary management
11. **`effect/services/TunnelProcess.ts`** — Process lifecycle + streams
12. **`effect/expose.ts`** — Quick tunnel convenience
13. **`effect/layers/Live.ts`** + **`Test.ts`** — Layer composition
14. **`effect/index.ts`** — Public exports
15. **`index.ts`** — Async/await wrapper using ManagedRuntime
16. **Tests** — Port existing tests to `@effect/vitest` with `it.effect`
17. **`tunnels` integration** — Wire LiveLayer to real SDK services
