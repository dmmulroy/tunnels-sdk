import { Console, Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { QuickTunnelService, TunnelApiService, IngressService, DnsService } from "../services.js"

export const expose = Command.make("expose", {
  port: Argument.integer("port").pipe(
    Argument.withDescription("Local port to expose")
  ),
  hostname: Flag.string("hostname").pipe(
    Flag.withDescription("Custom domain (requires auth)"),
    Flag.optional
  ),
  protocol: Flag.choice("protocol", ["http", "https", "ssh", "rdp", "tcp"]).pipe(
    Flag.withDescription("Protocol to expose"),
    Flag.withDefault("http")
  ),
  cleanup: Flag.boolean("cleanup").pipe(
    Flag.withDescription("Auto-cleanup DNS on exit")
  ),
}, (config) =>
  Effect.gen(function* () {
    const maybeHostname = Option.getOrUndefined(config.hostname)

    if (maybeHostname) {
      // Named tunnel path — create tunnel, configure ingress, create DNS
      yield* namedTunnel(config.port, maybeHostname, config.protocol)
    } else {
      // Quick tunnel path — anonymous, no auth needed
      yield* quickTunnel(config.port)
    }
  })
).pipe(
  Command.withDescription("Expose a local port through a Cloudflare Tunnel")
)

const quickTunnel = (port: number) =>
  Effect.gen(function* () {
    const svc = yield* QuickTunnelService
    const result = yield* svc.expose(port)
    yield* Console.log(`⚡ Tunnel live → ${result.url} → localhost:${port}`)
  })

const namedTunnel = (port: number, hostname: string, protocol: string) =>
  Effect.gen(function* () {
    const tunnelApi = yield* TunnelApiService
    const ingressSvc = yield* IngressService
    const dnsSvc = yield* DnsService

    // 1. Create tunnel (name derived from hostname)
    const tunnelName = hostname.split(".")[0]
    const tunnel = yield* tunnelApi.create(tunnelName)

    // 2. Configure ingress
    const service = `${protocol}://localhost:${port}`
    yield* ingressSvc.add(hostname, service)

    // 3. Create DNS CNAME
    yield* dnsSvc.create(hostname, tunnel.name)

    yield* Console.log(`⚡ Tunnel live → https://${hostname} → localhost:${port}`)
    yield* Console.log(`  Tunnel: ${tunnel.name} (${tunnel.id})`)
  })
