/**
 * Named Tunnel — full lifecycle in one chain.
 *
 * Creates a tunnel, configures ingress, sets up DNS, and runs it.
 * Demonstrates the core value prop: what takes 4+ API calls and
 * a separate `cloudflared` process becomes one fluent chain.
 */

import { TunnelClient } from "tunnel-sdk"

const client = new TunnelClient({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: process.env.CF_API_TOKEN!,
})

// Create + configure + DNS in one call
const tunnel = await client.tunnels.create("my-app", {
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
    { hostname: "api.example.com", service: "http://localhost:8080" },
  ],
  dns: { auto: true },
})

console.log(`Tunnel "${tunnel.name}" created (${tunnel.id})`)

// Run the tunnel
await using connection = await tunnel.run()

// Wait for all 4 connections to be established
await connection.waitUntilHealthy()

console.log(`Status: ${connection.status}`)
for (const conn of connection.connectors) {
  console.log(`  → ${conn.location} (${conn.ip})`)
}

// Listen for events
connection.on("error", (err) => {
  console.error(`Tunnel error: ${err.message} (retryable: ${err.retryable})`)
})

connection.on("metrics", (m) => {
  console.log(`${m.rps} req/s — p50: ${m.p50Ms}ms, p99: ${m.p99Ms}ms`)
})

// Keep running until SIGINT/SIGTERM
await connection.waitUntilExit()
