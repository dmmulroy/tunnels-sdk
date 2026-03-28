# `@cloudflare/tunnel` — TypeScript Library Design

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
npm install @cloudflare/tunnel
```

No separate `cloudflared` installation required. The binary is auto-downloaded, platform-matched, and version-locked on first use.

---

## API Overview

### Quick Expose (Zero Config)

```ts
import { expose } from "@cloudflare/tunnel"

// One-liner: expose a port, get a URL
const tunnel = await expose(3000)
console.log(tunnel.url) // https://abc123.trycloudflare.com

// With options
const tunnel = await expose(3000, {
  hostname: "app.example.com",   // requires auth
  protocol: "http",              // http | https | tcp | ssh | rdp
  apiToken: process.env.CF_API_TOKEN,
  accountId: process.env.CF_ACCOUNT_ID,
})

// Cleanup
await tunnel.close()
```

### Quick Expose with Explicit Resource Management

```ts
import { expose } from "@cloudflare/tunnel"

// `using` ensures cleanup even if an exception is thrown
await using tunnel = await expose(3000)
console.log(tunnel.url)
// tunnel.close() called automatically when scope exits
```

---

### `TunnelClient` — Full API Access

```ts
import { TunnelClient } from "@cloudflare/tunnel"

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
  search: "prod",       // partial match
})

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

### `Tunnel` Object

The `Tunnel` object is the core primitive. It represents a tunnel and provides methods for all tunnel operations.

```ts
const tunnel = await client.tunnels.get("my-app")

// Properties
tunnel.id          // "c1744f8b-faa1-48a4-9e5c-02ac921467fa"
tunnel.name        // "my-app"
tunnel.status      // "healthy" | "inactive" | "degraded"
tunnel.createdAt   // Date
tunnel.connections // TunnelConnection[]
tunnel.token       // string (for running on other machines)
```

#### Running a Tunnel

```ts
// Run the tunnel (starts cloudflared process)
const connection = await tunnel.run()

// Connection info
connection.status       // "healthy"
connection.connectors   // [{ id, colo, ip, location }]
connection.uptime       // Duration

// Wait for healthy state
await connection.waitUntilHealthy()
// Resolves when 4 connections established, rejects on timeout

// Graceful shutdown
await connection.close()

// Or with resource management
await using connection = await tunnel.run()
// auto-closes on scope exit
```

#### Ingress Management

```ts
// List rules
const rules = await tunnel.ingress.list()
// [
//   { hostname: "app.example.com", service: "http://localhost:3000", originRequest: {...} },
//   { hostname: "api.example.com", service: "http://localhost:8080", originRequest: {...} },
//   { service: "http_status:404" }  // catch-all
// ]

// Add a rule
await tunnel.ingress.add({
  hostname: "new.example.com",
  service: "http://localhost:9090",
  originRequest: {
    connectTimeout: "60s",
    noTLSVerify: true,
  },
})

// Remove a rule
await tunnel.ingress.remove("old.example.com")

// Replace all rules
await tunnel.ingress.set([
  { hostname: "app.example.com", service: "http://localhost:3000" },
  { hostname: "api.example.com", service: "http://localhost:8080" },
  // catch-all auto-appended if missing
])
```

#### DNS Management

```ts
// Create CNAME record pointing to this tunnel
await tunnel.dns.ensure("app.example.com")
// Idempotent — creates if missing, no-ops if exists and correct

// Create with options
await tunnel.dns.ensure("app.example.com", {
  proxied: true,   // default: true
  ttl: 300,        // only applies if proxied is false
})

// Remove
await tunnel.dns.remove("old.example.com")

// List DNS records pointing to this tunnel
const records = await tunnel.dns.list()
// [{ hostname: "app.example.com", type: "CNAME", content: "c1744f8b.cfargotunnel.com" }]
```

#### Route Management (Private Networks)

```ts
// Add a route
await tunnel.routes.add("172.16.0.0/16")
await tunnel.routes.add("10.0.0.0/8", { vnet: "production" })

// List routes
const routes = await tunnel.routes.list()

// Check which tunnel/route handles an IP
const result = await tunnel.routes.check("172.16.5.42")
// { tunnel: "my-app", route: "172.16.0.0/16", vnet: "default" }

// Remove a route
await tunnel.routes.remove("172.16.0.0/16")
```

#### Virtual Networks

```ts
const vnets = await client.vnets.list()
await client.vnets.create("production")
await client.vnets.create("staging", { default: true })
await client.vnets.delete("staging")
```

---

### Streaming Logs (Async Iterators)

```ts
// Stream all logs — async iterator with backpressure
for await (const entry of tunnel.logs()) {
  console.log(entry.timestamp, entry.level, entry.message)
}

// Every entry is fully typed
// {
//   timestamp: Date
//   level: "info" | "warn" | "error" | "debug"
//   event: string
//   message: string
//   connectorId?: string
//   ...extra fields depending on event type
// }

// With filters
for await (const entry of tunnel.logs({ level: "error", since: "5m" })) {
  alertSlack(entry)
}

// Collect into array (careful with long-running tunnels)
const recentErrors = await tunnel.logs({ level: "error", since: "1h" }).toArray()
```

---

### Typed Events

```ts
const connection = await tunnel.run()

// Every event is typed — no `any`
connection.on("connected", (conn: ConnectorInfo) => {
  // { id: string, colo: string, ip: string, location: string }
  console.log(`Connected to ${conn.location}`)
})

connection.on("disconnected", (conn: ConnectorInfo) => {
  console.log(`Lost connection to ${conn.location}`)
})

connection.on("reconnecting", (attempt: ReconnectAttempt) => {
  // { number: number, delay: number, connector: ConnectorInfo }
  console.log(`Reconnecting... attempt ${attempt.number}`)
})

connection.on("error", (err: TunnelError) => {
  // { code: string, message: string, retryable: boolean, connector?: ConnectorInfo }
  if (!err.retryable) process.exit(1)
})

connection.on("metrics", (m: TunnelMetrics) => {
  // { rps: number, p50Ms: number, p99Ms: number, activeConns: number, bytesIn: number, bytesOut: number }
  prometheus.gauge("tunnel_rps", m.rps)
})

connection.on("status", (s: TunnelStatus) => {
  // "healthy" | "degraded" | "inactive"
  if (s === "degraded") pagerduty.alert("Tunnel degraded")
})
```

---

### Config Validation (Zod-Powered)

```ts
import { TunnelConfig } from "@cloudflare/tunnel"

// Validate a config object
const result = TunnelConfig.safeParse({
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
  ],
})

if (!result.success) {
  console.error(result.error.format())
  // Ingress rules must end with a catch-all rule.
  // Add { service: "http_status:404" } as the last rule,
  // or set `autoFallback: true`.
}

// Parse (throws on invalid)
const config = TunnelConfig.parse({
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
    { service: "http_status:404" },
  ],
})

// Load from YAML file with validation
const config = await TunnelConfig.fromFile("./cft.yaml")

// Load from YAML string
const config = TunnelConfig.fromYaml(`
  ingress:
    - hostname: app.example.com
      service: http://localhost:3000
    - service: http_status:404
`)
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
import { cloudflared } from "@cloudflare/tunnel/bin"

// Binary is auto-downloaded on first use
// Stored in node_modules/.cache/@cloudflare/tunnel/
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
  binaryPath?: string          // override auto-managed binary
  baseUrl?: string             // override API base URL (testing)
}

interface Tunnel {
  id: string
  name: string
  status: TunnelStatus
  createdAt: Date
  deletedAt: Date | null
  connections: TunnelConnection[]
  token: string
  remoteConfig: boolean

  // Sub-resources
  ingress: IngressManager
  dns: DnsManager
  routes: RouteManager

  // Actions
  run(options?: RunOptions): Promise<TunnelProcess>
  delete(options?: DeleteOptions): Promise<void>
  getToken(): Promise<string>
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
  /** Override config for this run */
  config?: TunnelConfig

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

| | Official SDK | Community `cloudflared` | `@cloudflare/tunnel` |
|---|---|---|---|
| API management | ✅ (verbose, deeply nested) | ❌ | ✅ (ergonomic, flat) |
| Binary management | ❌ | ✅ (manual) | ✅ (invisible, version-locked) |
| Run tunnel process | ❌ | ✅ (raw spawn) | ✅ (managed, events, cleanup) |
| Typed events | ❌ | ❌ | ✅ (full event map) |
| Config validation | ❌ | ❌ | ✅ (Zod schemas) |
| Streaming logs | ❌ | ❌ | ✅ (async iterators) |
| Disposable / cleanup | ❌ | ❌ | ✅ (`using` / `.close()`) |
| DNS auto-management | ❌ | ❌ | ✅ (`.dns.ensure()`) |
| One-liner expose | ❌ | ✅ (`Tunnel.quick()`) | ✅ (`expose(3000)`) |
| Named tunnel lifecycle | Manual (4+ calls) | ❌ | Single chain |
| Ingress management | Raw API calls | ❌ | `.ingress.add/remove/set()` |
| Route management | Raw API calls | ❌ | `.routes.add/remove/check()` |
| Pagination | Manual cursor | ❌ | `for await` auto-pagination |
| AbortSignal support | ❌ | ❌ | ✅ |
