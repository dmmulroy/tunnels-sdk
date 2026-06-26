# `tunnels` — TypeScript SDK

TypeScript SDK for Cloudflare Tunnels.

The default `tunnels` export is a plain async/await wrapper for tunnel metadata,
ingress, DNS, private routes, virtual networks, config parsing, and anonymous
quick tunnels.

## Install

```bash
npm install tunnels
```

## Quick Expose

Anonymous quick tunnels do not require Cloudflare credentials.

```ts
import { expose } from "tunnels"

await using tunnel = await expose(3000)
console.log(tunnel.url)
```

Or clean up manually:

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

Dispose the client when finished:

```ts
await client.dispose()
```

## Named Tunnel Metadata And Resources

`client.tunnels.create()` returns immutable `TunnelInfo` metadata. Follow-up
operations are on client-level managers and take the tunnel ID.

```ts
const tunnel = await client.tunnels.create("my-app", {
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
    { hostname: "api.example.com", service: "http://localhost:8080" },
  ],
})

await client.ingress.add(tunnel.id, {
  hostname: "admin.example.com",
  service: "http://localhost:9090",
})

await client.dns.ensure(tunnel.id, "admin.example.com")
await client.routes.add(tunnel.id, "10.0.0.0/8", { vnet: "production" })
```

Useful tunnel operations:

```ts
const tunnel = await client.tunnels.get("my-app")
const existing = await client.tunnels.for("my-app")
const healthy = await client.tunnels.list({ status: "healthy" })

for await (const tunnel of client.tunnels.listAll()) {
  console.log(tunnel.name)
}

const token = await client.tunnels.getToken(tunnel.id)
await client.tunnels.delete(tunnel.id, { force: true })
```

DNS is inferred from ingress hostnames by default during create. Disable it with
`dns: false` or `dns: { auto: false }`. Replace conflicting records with
`dns: { overwrite: true }`.

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

The parser validates ingress rules, catch-all behavior, duplicate hostnames,
service schemes, CIDR syntax, and known `originRequest` keys.

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

The SDK auto-installs a pinned `cloudflared` binary when an operation needs it.
Manual controls are exported from `tunnels/bin`.

```ts
import { cloudflared } from "tunnels/bin"

await cloudflared.isInstalled()
await cloudflared.install()
await cloudflared.update()
await cloudflared.remove()
```
