# tunnels

TypeScript SDK for Cloudflare Tunnels.

The default export is a plain async/await wrapper for tunnel metadata, ingress,
DNS, private routes, virtual networks, config parsing, and anonymous quick
tunnels.

## Install

```bash
npm install tunnels
```

## Quick Expose

Create an anonymous `*.trycloudflare.com` tunnel. No Cloudflare account or API
token is required.

```ts
import { expose } from "tunnels"

await using tunnel = await expose(3000)
console.log(tunnel.url)
```

Manual cleanup is also supported:

```ts
const tunnel = await expose(3000)
await tunnel.close()
```

## Authenticated Client

```ts
import { TunnelClient } from "tunnels"

const client = new TunnelClient({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  apiToken: process.env.CLOUDFLARE_API_TOKEN!,
})
```

Always dispose the client when you are done with it:

```ts
await client.dispose()
```

## Named Tunnels

`client.tunnels.create()` creates the tunnel and can also configure ingress,
DNS, and private routes. It returns immutable `TunnelInfo` metadata. Follow-up
resource operations are currently on `client.ingress`, `client.dns`, and
`client.routes` and take a tunnel ID.

```ts
const tunnel = await client.tunnels.create("my-app", {
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
    { hostname: "api.example.com", service: "http://localhost:8080" },
  ],
})

console.log(tunnel.id)
console.log(tunnel.status)
```

DNS is inferred from ingress hostnames by default. Use `dns: false` or
`dns: { auto: false }` to disable automatic DNS. Conflicting DNS records fail
unless you pass `dns: { overwrite: true }`.

```ts
const tunnel = await client.tunnels.create("my-app", {
  ingress: [{ hostname: "app.example.com", service: "http://localhost:3000" }],
  dns: { overwrite: true },
  routes: [{ network: "10.0.0.0/8", vnet: "production" }],
})
```

## Tunnel Operations

```ts
const existing = await client.tunnels.for("my-app")
const tunnel = await client.tunnels.get("my-app")
const sameTunnel = await client.tunnels.get("c1744f8b-faa1-48a4-9e5c-02ac921467fa")

const healthy = await client.tunnels.list({ status: "healthy" })

for await (const tunnel of client.tunnels.listAll()) {
  console.log(tunnel.name)
}

const token = await client.tunnels.getToken(tunnel.id)
await client.tunnels.delete(tunnel.id, { force: true })
```

`client.tunnels.for(name, options?)` gets an exact-name match or creates it.
Options are only applied when the tunnel is created.

## Ingress

Ingress rules map public hostnames to origin services.

```ts
await client.ingress.add(tunnel.id, {
  hostname: "admin.example.com",
  service: "http://localhost:9090",
})

const rules = await client.ingress.list(tunnel.id)
await client.ingress.remove(tunnel.id, "admin.example.com")

await client.ingress.set(tunnel.id, [
  { hostname: "app.example.com", service: "http://localhost:3000" },
])
```

`set()` appends a catch-all `http_status:404` rule when the provided rules do
not already end with one.

## DNS

```ts
await client.dns.ensure(tunnel.id, "app.example.com")
await client.dns.ensure(tunnel.id, "app.example.com", { overwrite: true })

const records = await client.dns.list(tunnel.id)
await client.dns.remove("app.example.com")
```

DNS records created by the SDK are marked as managed so tunnel deletion can
clean them up safely.

## Private Routes And VNets

```ts
await client.vnets.create("production", { default: true })
const vnets = await client.vnets.list()

await client.routes.add(tunnel.id, "10.0.0.0/8", {
  vnet: "production",
  comment: "Production network",
})

const routes = await client.routes.list(tunnel.id)
const match = await client.routes.check("10.1.2.3")
await client.routes.remove(tunnel.id, "10.0.0.0/8")
```

## Config Parsing

Config parsing throws when validation fails. File parsing is async.

```ts
import { parseConfigFromFile, parseConfigFromYaml } from "tunnels"

const config = parseConfigFromYaml(`
ingress:
  - hostname: app.example.com
    service: http://localhost:3000
  - service: http_status:404
`)

const fileConfig = await parseConfigFromFile("./tunnels.yaml")
```

Validated fields include ingress ordering, catch-all behavior, hostname format,
service URL schemes, duplicate hostnames, CIDR syntax, and known
`originRequest` keys.

## Running Named Tunnels

The async wrapper exposes tunnel tokens, but it does not currently return a
runnable tunnel process object.

```ts
const tunnel = await client.tunnels.get("my-app")
const token = await client.tunnels.getToken(tunnel.id)

// Pass the token to cloudflared on the host that should run the connector.
console.log(token)
```

## Binary Management

The SDK auto-installs a pinned `cloudflared` binary for operations that need it,
including quick expose and supervised named tunnel runs.

Manual binary controls are available from `tunnels/bin`:

```ts
import { cloudflared } from "tunnels/bin"

await cloudflared.isInstalled()
await cloudflared.install()
await cloudflared.update()
await cloudflared.remove()
```
