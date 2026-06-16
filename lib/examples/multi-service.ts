import { TunnelClient } from "tunnels"

const client = new TunnelClient({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: process.env.CF_API_TOKEN!,
})

// Create with multiple services
const tunnel = await client.tunnels.create("platform", {
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
    { hostname: "api.example.com", service: "http://localhost:8080" },
    {
      hostname: "docs.example.com",
      service: "http://localhost:4000",
      originRequest: { connectTimeout: "60s" },
    },
  ],
})

// Later: add a new service without touching existing ones
await client.ingress.add(tunnel.id, {
  hostname: "admin.example.com",
  service: "http://localhost:9090",
} as any)
await client.dns.ensure(tunnel.id, "admin.example.com")

// List all ingress rules
const rules = await client.ingress.list(tunnel.id)
for (const rule of rules) {
  if (rule.hostname) {
    console.log(`${rule.hostname} → ${rule.service}`)
  } else {
    console.log(`(catch-all) → ${rule.service}`)
  }
}

// Add private network routes
await client.routes.add(tunnel.id, "172.16.0.0/16")
await client.routes.add(tunnel.id, "10.0.0.0/8", { vnet: "production" })

// Check route resolution
const check = await client.routes.check("172.16.5.42")
if (check) {
  console.log(`172.16.5.42 → tunnel "${check.tunnel}" via ${check.route}`)
}

// Remove a service
await client.ingress.remove(tunnel.id, "docs.example.com")
await client.dns.remove("docs.example.com")

// Cleanup
await client.tunnels.delete(tunnel.id, { force: true })
await client.dispose()
