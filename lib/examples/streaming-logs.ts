/**
 * Streaming Logs — async iterators for tunnel observability.
 *
 * Demonstrates using async iterators to process tunnel logs
 * with backpressure, filtering, and aggregation.
 */

import { TunnelClient } from "@cloudflare/tunnel"

const client = new TunnelClient({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: process.env.CF_API_TOKEN!,
})

const tunnel = await client.tunnels.get("my-app")

// Stream all logs
console.log("--- All logs ---")
for await (const entry of tunnel.logs()) {
  const ts = entry.timestamp.toISOString()
  console.log(`[${ts}] ${entry.level.toUpperCase()} ${entry.message}`)

  // Each entry is fully typed
  if (entry.event === "connected") {
    console.log(`  → Connected to ${entry.connectorId}`)
  }
}

// Stream only errors from the last 5 minutes
console.log("\n--- Recent errors ---")
for await (const entry of tunnel.logs({ level: "error", since: "5m" })) {
  console.error(`[ERROR] ${entry.message}`)
}

// Collect into an array (careful with long-running tunnels)
const recentErrors = await tunnel
  .logs({ level: "error", since: "1h" })
  .toArray()

console.log(`\n${recentErrors.length} errors in the last hour`)

// Use with AbortController for time-limited collection
const controller = new AbortController()
setTimeout(() => controller.abort(), 10_000) // stop after 10s

for await (const entry of tunnel.logs({ signal: controller.signal })) {
  console.log(entry.message)
}
