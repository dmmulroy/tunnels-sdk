/**
 * Basic tunnel management using the Effect SDK directly.
 *
 * This example shows how to create, list, and delete tunnels using
 * Effect services and the LiveLayer. No async/await wrapper needed —
 * everything is type-safe and composable.
 */
import { Effect, Redacted, Stream } from "effect"
import {
  TunnelOperations,
  IngressManager,
  DnsManager,
  CloudflareApiConfig,
  LiveLayer,
} from "tunnels/effect"

const config = new CloudflareApiConfig({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: Redacted.make(process.env.CF_API_TOKEN!),
})

const program = Effect.gen(function* () {
  const tunnels = yield* TunnelOperations
  const ingress = yield* IngressManager
  const dns = yield* DnsManager

  // Create a tunnel with ingress; DNS is inferred from ingress hostnames by default
  const tunnel = yield* tunnels.create("my-effect-app", {
    ingress: [
      { hostname: "app.example.com", service: "http://localhost:3000" },
    ],
  })

  yield* Effect.log(`Created tunnel: ${tunnel.name} (${tunnel.id})`)

  // List all tunnels
  const allTunnels = yield* tunnels.list()
  yield* Effect.log(`Total tunnels: ${allTunnels.length}`)

  // Stream through all tunnels (paginated)
  yield* tunnels
    .listAll()
    .pipe(
      Stream.runForEach((t) =>
        Effect.log(`  ${t.name} — ${t.status}`),
      ),
    )

  // Manage ingress rules directly
  const rules = yield* ingress.list(tunnel.id)
  yield* Effect.log(`Ingress rules: ${rules.length}`)

  // Manage DNS records
  yield* dns.ensure(tunnel.id, "api.example.com")
  const records = yield* dns.list(tunnel.id)
  yield* Effect.log(`DNS records: ${records.length}`)

  // Cleanup
  yield* tunnels.del(tunnel.id, { force: true })
  yield* Effect.log("Tunnel deleted")
}).pipe(
  Effect.provide(LiveLayer(config)),
)

// Run the program
Effect.runPromise(program).catch(console.error)
