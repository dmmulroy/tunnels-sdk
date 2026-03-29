import { TunnelClient } from "tunnel-sdk"

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
  dns: { auto: true },
})

// Later: add a new service without touching existing ones
await tunnel.ingress.add({
  hostname: "admin.example.com",
  service: "http://localhost:9090",
})
await tunnel.dns.ensure("admin.example.com")

// List all ingress rules
const rules = await tunnel.ingress.list()
for (const rule of rules) {
  if (rule.hostname) {
    console.log(`${rule.hostname} → ${rule.service}`)
  } else {
    console.log(`(catch-all) → ${rule.service}`)
  }
}

// Add private network routes
await tunnel.routes.add("172.16.0.0/16")
await tunnel.routes.add("10.0.0.0/8", { vnet: "production" })

// Check route resolution
const check = await tunnel.routes.check("172.16.5.42")
if (check) {
  console.log(`172.16.5.42 → tunnel "${check.tunnel}" via ${check.route}`)
}

// Remove a service
await tunnel.ingress.remove("docs.example.com")
await tunnel.dns.remove("docs.example.com")

// Run with monitoring
await using connection = await tunnel.run()
await connection.waitUntilHealthy()

connection.on("status", (status) => {
  if (status === "degraded") {
    console.warn("⚠️  Tunnel degraded — some connections lost")
  }
})

await connection.waitUntilExit()
