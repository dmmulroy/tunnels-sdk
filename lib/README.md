# `tunnels` — TypeScript SDK

A TypeScript library for Cloudflare Tunnels with top-notch DX. Manages the full tunnel lifecycle — API calls, binary management, process lifecycle, streaming logs — in one package.

## Problems with Existing Options

### Official SDK (`cloudflare` npm)

- Auto-generated from OpenAPI — mirrors REST paths, not developer intent
- `client.zeroTrust.tunnels.cloudflared.create(...)` — deeply nested
- No tunnel process management — API-only, you still run `cloudflared` separately
- No config validation
- No streaming logs or events
- Create + configure + DNS + run = 4+ separate calls you stitch together manually

### Community Wrapper (`cloudflared` npm)

- Wraps the binary via `child_process.spawn`
- EventEmitter-based with untyped events
- `Tunnel.quick()` only does anonymous quick tunnels
- No API integration — binary-only
- Manual binary installation management
- No named tunnel support, no auth

### This Library

Gives you both. API management + process management + config validation + streaming + cleanup, in one package.

---

## Installation

```bash
npm install tunnels
```

No separate `cloudflared` installation required. The binary is auto-downloaded, platform-matched, and version-locked on first use.

---

## API Overview

### Quick Expose (Zero Config)

```ts
import { expose } from "tunnels"

// One-liner: expose a port, get a URL
const tunnel = await expose(3000)
console.log(tunnel.url) // https://abc123.trycloudflare.com

// With options
const tunnel = await expose(3000, {
  binaryPath: "/usr/local/bin/cloudflared", // optional custom binary
})

// Cleanup
await tunnel.close()
```

### Quick Expose with Explicit Resource Management

```ts
import { expose } from "tunnels"

// `using` ensures cleanup even if an exception is thrown
await using tunnel = await expose(3000)
console.log(tunnel.url)
// tunnel.close() called automatically when scope exits
```

---

### `TunnelClient` — Full API Access

```ts
import { TunnelClient } from "tunnels"

const client = new TunnelClient({
  accountId: process.env.CF_ACCOUNT_ID,
  apiToken: process.env.CF_API_TOKEN,
})
```

#### Create a Tunnel

```ts
const tunnel = await client.tunnels.create("my-app", {
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
    { hostname: "api.example.com", service: "http://localhost:8080" },
  ],
  dns: { auto: true },
})

// Everything happened:
// 1. Tunnel created via API
// 2. Ingress config pushed
// 3. DNS CNAME records created for each hostname
// 4. Tunnel object returned, ready to run
```

#### List Tunnels

```ts
const tunnels = await client.tunnels.list()
for (const t of tunnels) {
  console.log(`${t.name} (${t.status}) — ${t.connections.length} connections`)
}

// With filters
const active = await client.tunnels.list({
  status: "healthy",
  name: "my-app",       // exact match
})

// `search` is a convenience alias for `name` (exact match, not fuzzy)
const matching = await client.tunnels.list({ search: "prod" })

// Pagination built-in
for await (const tunnel of client.tunnels.listAll()) {
  console.log(tunnel.name)
}
```

#### Get a Tunnel

```ts
const tunnel = await client.tunnels.get("my-app")     // by name
const tunnel = await client.tunnels.get("c1744f8b...")  // by ID
```

#### Delete a Tunnel

```ts
await client.tunnels.delete("my-app")
await client.tunnels.delete("my-app", {
  force: true,        // delete even with active connections
  cleanupDns: true,   // remove associated CNAME records
})
```

---

### `TunnelInfo` Object

`TunnelInfo` is an immutable data object. Sub-resource operations are on the client, not the tunnel.

```ts
const tunnel = await client.tunnels.get("my-app")

// Properties
tunnel.id          // "c1744f8b-faa1-48a4-9e5c-02ac921467fa"
tunnel.name        // "my-app"
tunnel.status      // "healthy" | "inactive" | "degraded" | "down"
tunnel.createdAt   // string (ISO 8601)
tunnel.connections // TunnelConnection[]

// Get a token for running cloudflared
const token = await client.tunnels.getToken(tunnel.id)
```

#### Ingress Management

```ts
// List rules for a tunnel
const rules = await client.ingress.list(tunnel.id)

// Add a rule
await client.ingress.add(tunnel.id, {
  hostname: "new.example.com",
  service: "http://localhost:9090",
  originRequest: {
    connectTimeout: "60s",
    noTLSVerify: true,
  },
})

// Remove a rule
await client.ingress.remove(tunnel.id, "old.example.com")

// Replace all rules
await client.ingress.set(tunnel.id, [
  { hostname: "app.example.com", service: "http://localhost:3000" },
  { hostname: "api.example.com", service: "http://localhost:8080" },
  // catch-all auto-appended if missing
])
```

#### DNS Management

```ts
// Create CNAME record pointing to this tunnel
await client.dns.ensure(tunnel.id, "app.example.com")
// Idempotent — creates if missing, no-ops if exists and correct

// Create with options
await client.dns.ensure(tunnel.id, "app.example.com", {
  proxied: true,   // default: true
  ttl: 300,        // only applies if proxied is false
})

// Remove
await client.dns.remove(tunnel.id, "old.example.com")

// List DNS records pointing to this tunnel
const records = await client.dns.list(tunnel.id)
// [{ hostname: "app.example.com", type: "CNAME", content: "c1744f8b.cfargotunnel.com" }]
```

#### Route Management (Private Networks)

```ts
// Add a route
await client.routes.add(tunnel.id, "172.16.0.0/16")
await client.routes.add(tunnel.id, "10.0.0.0/8", { vnet: "production" })

// List routes
const routes = await client.routes.list(tunnel.id)

// Check which tunnel/route handles an IP (returns null if no route)
const result = await client.routes.check("172.16.5.42")
if (result) {
  // { tunnel: "my-app", route: "172.16.0.0/16", vnet: "default" }
}

// Remove a route
await client.routes.remove(tunnel.id, "172.16.0.0/16")
```

#### Virtual Networks

```ts
const vnets = await client.vnets.list()
await client.vnets.create("production")
await client.vnets.create("staging", { default: true })
await client.vnets.delete("staging")
```

#### Cleanup

```ts
// Always dispose the client when done
await client.dispose()
```

---

### Effect SDK (Advanced)

For full power, use the Effect SDK directly via `tunnels/effect`:

```ts
import { Effect, Redacted, Stream } from "effect"
import { TunnelOperations, DnsManager, LiveLayer, CloudflareApiConfig } from "tunnels/effect"

const config = new CloudflareApiConfig({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: Redacted.make(process.env.CF_API_TOKEN!),
})

const program = Effect.gen(function* () {
  const tunnels = yield* TunnelOperations
  const dns = yield* DnsManager

  // Create a tunnel
  const tunnel = yield* tunnels.create("my-app", {
    ingress: [{ hostname: "app.example.com", service: "http://localhost:3000" }],
    dns: { auto: true },
  })

  // Stream all tunnels
  yield* tunnels.listAll().pipe(
    Stream.runForEach((t) => Effect.log(`${t.name} — ${t.status}`)),
  )

  // Cleanup
  yield* tunnels.del(tunnel.id, { force: true, cleanupDns: true })
}).pipe(Effect.provide(LiveLayer(config)))

Effect.runPromise(program)
```

See `lib/examples/effect-basic.ts` and `lib/examples/effect-testing.ts` for more.

---

### Config Validation (Effect-Powered)

```ts
import { Effect, Exit } from "effect"
import { parseConfig, parseConfigFromYaml, parseConfigFromFile } from "tunnels"

// Validate a config object
const result = Effect.runSyncExit(
  parseConfig({
    ingress: [
      { hostname: "app.example.com", service: "http://localhost:3000" },
      { service: "http_status:404" },
    ],
  }),
)

if (Exit.isSuccess(result)) {
  console.log("Config is valid!")
}

// Parse from YAML string
const config = Effect.runSync(
  parseConfigFromYaml(`
    ingress:
      - hostname: app.example.com
        service: http://localhost:3000
      - service: http_status:404
  `),
)

// Load from YAML file (async)
const fileConfig = await Effect.runPromise(
  parseConfigFromFile("./tunnels.yaml"),
)
```

#### Validation Rules

- Ingress must have at least one rule
- Last rule must be a catch-all (no `hostname`) — or `autoFallback: true`
- Hostnames must be valid domain names
- Service URLs must have a valid scheme (`http://`, `https://`, `tcp://`, `ssh://`, `rdp://`, `http_status:`)
- No duplicate hostnames
- `originRequest` fields validated (e.g., `connectTimeout` must be a valid duration string)
- Unknown keys are errors — no silent typos

---

### Binary Management

The library auto-manages the `cloudflared` binary. You never need to think about it.

```ts
import { cloudflared } from "tunnels/bin"

// Binary is auto-downloaded on first use
// Stored in node_modules/.cache/tunnels/bin/
// Version-locked to the library version

// Manual control if you need it
cloudflared.path       // "/path/to/cloudflared"
cloudflared.version    // "2025.2.0"

await cloudflared.install()                    // install/update to library-locked version
await cloudflared.install({ version: "2025.1.0" })  // specific version
await cloudflared.update()                     // update to latest
await cloudflared.remove()                     // remove cached binary

// Check if binary is available
if (await cloudflared.isInstalled()) {
  console.log(`cloudflared ${cloudflared.version} at ${cloudflared.path}`)
}

// Use your own binary
const client = new TunnelClient({
  accountId: "...",
  apiToken: "...",
  binaryPath: "/usr/local/bin/cloudflared",  // skip auto-download
})
```

---

## Types

### Core Types

```ts
interface TunnelClientOptions {
  accountId: string
  apiToken: string
  baseUrl?: string             // override API base URL (testing)
}

// TunnelClient has sub-clients for each resource:
// client.tunnels  — CRUD, listAll, getToken
// client.ingress  — add, remove, set, list (takes tunnelId)
// client.dns      — ensure, remove, list (takes tunnelId)
// client.routes   — add, remove, list, check (takes tunnelId)
// client.vnets    — create, delete, list

interface TunnelInfo {
  id: string
  name: string
  status: TunnelStatus
  createdAt: string
  deletedAt: string | null
  connections: TunnelConnection[]
  remoteConfig: boolean
}

type TunnelStatus = "healthy" | "inactive" | "degraded" | "down"

interface TunnelConnection {
  id: string
  colo: string
  ip: string
  location: string
  openedAt: Date
  clientVersion: string
  isPendingReconnect: boolean
}

interface IngressRule {
  hostname?: string           // undefined = catch-all
  service: string
  path?: string
  originRequest?: OriginRequestConfig
}

interface OriginRequestConfig {
  connectTimeout?: string     // e.g., "30s"
  tlsTimeout?: string
  tcpKeepAlive?: string
  noHappyEyeballs?: boolean
  keepAliveConnections?: number
  keepAliveTimeout?: string
  httpHostHeader?: string
  originServerName?: string
  noTLSVerify?: boolean
  disableChunkedEncoding?: boolean
  proxyAddress?: string
  proxyPort?: number
  proxyType?: string
}
```

### Event Types

```ts
interface ConnectorInfo {
  id: string
  colo: string
  ip: string
  location: string
}

interface ReconnectAttempt {
  number: number
  delay: number
  connector: ConnectorInfo
}

interface TunnelError {
  code: string
  message: string
  retryable: boolean
  connector?: ConnectorInfo
}

interface TunnelMetrics {
  rps: number
  p50Ms: number
  p99Ms: number
  activeConns: number
  bytesIn: number
  bytesOut: number
}

interface LogEntry {
  timestamp: Date
  level: "info" | "warn" | "error" | "debug"
  event: string
  message: string
  connectorId?: string
  [key: string]: unknown
}

// Typed event map — enforced by TypeScript
interface TunnelProcessEvents {
  connected: (connector: ConnectorInfo) => void
  disconnected: (connector: ConnectorInfo) => void
  reconnecting: (attempt: ReconnectAttempt) => void
  error: (error: TunnelError) => void
  metrics: (metrics: TunnelMetrics) => void
  status: (status: TunnelStatus) => void
  exit: (code: number) => void
}
```

### Run Options

```ts
interface RunOptions {
  /** Metrics server address (e.g., "localhost:12345") */
  metrics?: string

  /** Log level for cloudflared process */
  logLevel?: "debug" | "info" | "warn" | "error"

  /** Grace period for shutdown (default: "30s") */
  gracePeriod?: string

  /** Number of retries for connection (default: 5) */
  retries?: number

  /** AbortSignal for cancellation */
  signal?: AbortSignal
}

interface DeleteOptions {
  /** Force delete even with active connections */
  force?: boolean

  /** Remove associated DNS records */
  cleanupDns?: boolean
}
```

### Config Schema

```ts
interface TunnelConfig {
  /** Tunnel name or ID */
  tunnel?: string

  /** Ingress rules */
  ingress: IngressRule[]

  /** Auto-add catch-all if missing (default: true) */
  autoFallback?: boolean

  /** DNS management */
  dns?: {
    auto?: boolean        // auto-create CNAME on run
    cleanup?: boolean     // remove CNAME on delete
  }

  /** Private network routes */
  routes?: Array<{
    network: string       // CIDR notation
    vnet?: string         // virtual network name
    comment?: string
  }>

  /** Warp routing settings */
  warpRouting?: {
    enabled?: boolean
  }

  /** Origin server settings (applied to all rules as defaults) */
  originRequest?: OriginRequestConfig
}
```

---

## Comparison

| | Official SDK | Community `cloudflared` | `tunnels` |
|---|---|---|---|
| API management | ✅ (verbose, deeply nested) | ❌ | ✅ (ergonomic, flat) |
| Binary management | ❌ | ✅ (manual) | ✅ (invisible, version-locked) |
| Run tunnel process | ❌ | ✅ (raw spawn) | ✅ (managed, events, cleanup) |
| Typed events | ❌ | ❌ | ✅ (full event map) |
| Config validation | ❌ | ❌ | ✅ (Effect schemas) |
| Streaming logs | ❌ | ❌ | ✅ (async iterators) |
| Disposable / cleanup | ❌ | ❌ | ✅ (`using` / `.close()`) |
| DNS auto-management | ❌ | ❌ | ✅ (`.dns.ensure()`) |
| One-liner expose | ❌ | ✅ (`Tunnel.quick()`) | ✅ (`expose(3000)`) |
| Named tunnel lifecycle | Manual (4+ calls) | ❌ | Single chain |
| Ingress management | Raw API calls | ❌ | `.ingress.add/remove/set()` |
| Route management | Raw API calls | ❌ | `.routes.add/remove/check()` |
| Pagination | Manual cursor | ❌ | `for await` auto-pagination |
| AbortSignal support | ❌ | ❌ | ✅ |
