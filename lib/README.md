# `tunnels` — TypeScript SDK

TypeScript SDK for Cloudflare Tunnels.

The default `tunnels` export is a plain async/await wrapper for tunnel metadata,
ingress, DNS, private routes, virtual networks, config parsing, and anonymous
quick tunnels. The advanced `tunnels/effect` export exposes the Effect services
for process supervision, streams, and custom runtime composition.

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

The current wrapper accepts an auth provider. For a static Cloudflare API token,
use `makeApiTokenAuth()` with `EffectAuthProvider`.

```ts
import { EffectAuthProvider, TunnelClient, makeApiTokenAuth } from "tunnels"

const client = new TunnelClient({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
  authProvider: new EffectAuthProvider(
    makeApiTokenAuth(process.env.CLOUDFLARE_API_TOKEN!),
  ),
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

Config parsing returns Effect values.

```ts
import { Effect } from "effect"
import { parseConfigFromYaml } from "tunnels"

const config = Effect.runSync(
  parseConfigFromYaml(`
ingress:
  - hostname: app.example.com
    service: http://localhost:3000
  - service: http_status:404
`),
)
```

The parser validates ingress rules, catch-all behavior, duplicate hostnames,
service schemes, CIDR syntax, and known `originRequest` keys.

## Running Named Tunnels

The async wrapper exposes tunnel tokens, but it does not currently return a
runnable tunnel object. Use `tunnels/effect` for supervised `cloudflared`
process management.

```ts
import { Effect } from "effect"
import {
  CloudflareApiConfig,
  LiveLayer,
  TunnelOperations,
  TunnelProcessService,
  makeApiTokenAuth,
} from "tunnels/effect"

const config = new CloudflareApiConfig({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
})

const program = Effect.gen(function* () {
  const tunnels = yield* TunnelOperations
  const processes = yield* TunnelProcessService

  const tunnel = yield* tunnels.get("my-app")
  const token = yield* tunnels.getToken(tunnel.id)
  const running = yield* processes.run(token, { logLevel: "info" })

  yield* running.waitUntilHealthy
}).pipe(
  Effect.scoped,
  Effect.provide(LiveLayer(config, makeApiTokenAuth(process.env.CLOUDFLARE_API_TOKEN!))),
)

await Effect.runPromise(program)
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
