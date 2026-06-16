import { TunnelClient } from "tunnels"

const client = new TunnelClient({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: process.env.CF_API_TOKEN!,
})

// Create + configure + DNS in one call. DNS is inferred from ingress hostnames.
const tunnel = await client.tunnels.create("my-app", {
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
    { hostname: "api.example.com", service: "http://localhost:8080" },
  ],
})

console.log(`Tunnel "${tunnel.name}" created (${tunnel.id})`)
console.log(`Status: ${tunnel.status}`)
console.log(`Connections: ${tunnel.connections.length}`)

// Get a tunnel token (for running cloudflared manually or in another process)
const token = await client.tunnels.getToken(tunnel.id)
console.log(`Token: ${token.slice(0, 20)}...`)

// List all tunnels
const tunnels = await client.tunnels.list({ status: "healthy" })
for (const t of tunnels) {
  console.log(`  ${t.name} (${t.status}) — ${t.connections.length} connections`)
}

// Paginate through all tunnels
for await (const t of client.tunnels.listAll()) {
  console.log(`  ${t.name}`)
}

// Cleanup
await client.tunnels.delete("my-app", { force: true })
await client.dispose()
