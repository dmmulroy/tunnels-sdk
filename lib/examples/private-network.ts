import { TunnelClient } from "tunnel-sdk"

const client = new TunnelClient({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: process.env.CF_API_TOKEN!,
})

// Create virtual networks for environment isolation
await client.vnets.create("production")
await client.vnets.create("staging")

// Create a tunnel with private network routes
const tunnel = await client.tunnels.create("prod-network", {
  routes: [
    { network: "10.0.0.0/8", vnet: "production", comment: "Production VPC" },
    { network: "172.16.0.0/16", vnet: "production", comment: "Production services" },
  ],
})

console.log("Production network tunnel created")
console.log("Routes:")
const routes = await client.routes.list(tunnel.id)
for (const route of routes) {
  console.log(`  ${route.network} (${route.comment ?? "no comment"}) [vnet: ${route.vnet}]`)
}

// Verify a specific IP is routable
const check = await client.routes.check("10.1.5.42")
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

// Cleanup
await client.tunnels.delete(tunnel.id, { force: true })
await client.vnets.delete("production")
await client.vnets.delete("staging")
await client.dispose()
