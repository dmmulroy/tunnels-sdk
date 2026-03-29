# tunnel-sdk

TypeScript SDK for Cloudflare Tunnels.

## Install

```bash
pnpm add tunnel-sdk
```

## Quick start

```ts
import { expose, TunnelClient } from "tunnel-sdk"

await using tunnel = await expose(3000)
console.log(tunnel.url)

const client = new TunnelClient({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: process.env.CF_API_TOKEN!,
})
```
