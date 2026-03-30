import { Console, Effect } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { DnsService, type DnsRecordInfo } from "../services.js"
import { printData, printResult, type Column } from "../output.js"

const dnsColumns: ReadonlyArray<Column<DnsRecordInfo>> = [
  { header: "HOSTNAME", value: (r) => r.hostname },
  { header: "TUNNEL", value: (r) => r.tunnel },
]

const create = Command.make("create", {
  hostname: Argument.string("hostname").pipe(
    Argument.withDescription("DNS hostname")
  ),
  tunnel: Flag.string("tunnel").pipe(
    Flag.withDescription("Tunnel name")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* DnsService
    yield* api.create(config.hostname, config.tunnel)
    yield* printResult(
      { hostname: config.hostname, tunnel: config.tunnel, type: "CNAME" },
      `✓ CNAME ${config.hostname} → ${config.tunnel}`,
    )
  })
).pipe(Command.withDescription("Create a DNS CNAME record"))

const list = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const api = yield* DnsService
    const records = yield* api.list()
    yield* printData(records, dnsColumns)
  })
).pipe(Command.withDescription("List DNS records"))

const remove = Command.make("remove", {
  hostname: Argument.string("hostname").pipe(
    Argument.withDescription("Hostname to remove")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* DnsService
    yield* api.remove(config.hostname)
    yield* printResult(
      { removed: config.hostname },
      `✓ DNS record removed: ${config.hostname}`,
    )
  })
).pipe(Command.withDescription("Remove a DNS record"))

export const dns = Command.make("dns").pipe(
  Command.withDescription("DNS record management"),
  Command.withSubcommands([create, list, remove])
)
