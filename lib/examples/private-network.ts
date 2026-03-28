/**
 * Private Network Access — Zero Trust routing.
 *
 * Demonstrates setting up a tunnel for private network access
 * with virtual networks and route management.
 */

import { TunnelClient } from "@cloudflare/tunnel"

const client = new TunnelClient({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: process.env.CF_API_TOKEN!,
})

// Create virtual networks for environment isolation
await client.vnets.create("production")
await client.vnets.create("staging")

// Create a tunnel for the production network
const tunnel = await client.tunnels.create("prod-network", {
  routes: [
    { network: "10.0.0.0/8", vnet: "production", comment: "Production VPC" },
    { network: "172.16.0.0/16", vnet: "production", comment: "Production services" },
  ],
})

// Run the tunnel
await using connection = await tunnel.run()
await connection.waitUntilHealthy()

console.log("Production network tunnel is live")
console.log("Routes:")
const routes = await tunnel.routes.list()
for (const route of routes) {
  console.log(`  ${route.network} (${route.comment ?? "no comment"}) [vnet: ${route.vnet}]`)
}

// Verify a specific IP is routable
const check = await tunnel.routes.check("10.1.5.42")
if (check) {
  console.log(`\n10.1.5.42 is reachable via tunnel "${check.tunnel}" (${check.route})`)
} else {
  console.log("\n10.1.5.42 is not routable through any tunnel")
}

// List all virtual networks
const vnets = await client.vnets.list()
for (const vnet of vnets) {
  console.log(`${vnet.name} ${vnet.isDefault ? "(default)" : ""}`)
}

await connection.waitUntilExit()
