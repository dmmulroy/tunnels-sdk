import { Console, Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { TunnelApiService, type TunnelInfo } from "../services.js"
import { printData, type Column } from "../output.js"

// --- Subcommands ---

const create = Command.make("create", {
  name: Argument.string("name").pipe(
    Argument.withDescription("Tunnel name")
  ),
  dns: Flag.boolean("dns").pipe(
    Flag.withDescription("Auto-create DNS CNAME")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* TunnelApiService
    const tunnel = yield* api.create(config.name, { dns: config.dns })
    yield* Console.log(`✓ Tunnel "${tunnel.name}" created (id: ${tunnel.id})`)
  })
).pipe(
  Command.withDescription("Create a new named tunnel")
)

const tunnelColumns: ReadonlyArray<Column<TunnelInfo>> = [
  { header: "NAME", value: (t) => t.name },
  { header: "STATUS", value: (t) => t.status ?? "unknown" },
  { header: "CONNS", value: (t) => String(t.connections ?? 0) },
]

const list = Command.make("list", {
  status: Flag.string("status").pipe(
    Flag.withDescription("Filter by status"),
    Flag.optional
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* TunnelApiService
    const tunnels = yield* api.list({
      status: Option.getOrUndefined(config.status),
    })
    yield* printData(tunnels, tunnelColumns)
  })
).pipe(
  Command.withDescription("List tunnels")
)

const info = Command.make("info", {
  ref: Argument.string("name-or-id").pipe(
    Argument.withDescription("Tunnel name or ID")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* TunnelApiService
    const t = yield* api.get(config.ref)
    yield* Console.log(`Name:        ${t.name}`)
    yield* Console.log(`ID:          ${t.id}`)
    yield* Console.log(`Status:      ${t.status ?? "unknown"}`)
    yield* Console.log(`Connections: ${t.connections ?? 0}`)
  })
).pipe(
  Command.withDescription("Show tunnel details")
)

const del = Command.make("delete", {
  ref: Argument.string("name-or-id").pipe(
    Argument.withDescription("Tunnel name or ID")
  ),
  force: Flag.boolean("force").pipe(
    Flag.withDescription("Force delete even with active connections")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* TunnelApiService
    yield* api.delete(config.ref, { force: config.force })
    yield* Console.log(`✓ Tunnel "${config.ref}" deleted`)
  })
).pipe(
  Command.withDescription("Delete a tunnel")
)

const run_ = Command.make("run", {
  ref: Argument.string("name-or-id").pipe(
    Argument.withDescription("Tunnel name or ID")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* TunnelApiService
    yield* api.run(config.ref)
    yield* Console.log(`⚡ Tunnel "${config.ref}" running`)
  })
).pipe(
  Command.withDescription("Run a tunnel")
)

const stop = Command.make("stop", {
  ref: Argument.string("name-or-id").pipe(
    Argument.withDescription("Tunnel name or ID")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* TunnelApiService
    yield* api.stop(config.ref)
    yield* Console.log(`✓ Tunnel "${config.ref}" stopped`)
  })
).pipe(
  Command.withDescription("Stop a running tunnel")
)

const logs = Command.make("logs", {
  ref: Argument.string("name-or-id").pipe(
    Argument.withDescription("Tunnel name or ID")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* TunnelApiService
    const entries = yield* api.getLogs(config.ref)
    for (const entry of entries) {
      yield* Console.log(`[${entry.timestamp}] ${entry.level}: ${entry.message}`)
    }
  })
).pipe(
  Command.withDescription("Stream tunnel logs")
)

const token = Command.make("token", {
  ref: Argument.string("name-or-id").pipe(
    Argument.withDescription("Tunnel name or ID")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* TunnelApiService
    const tok = yield* api.getToken(config.ref)
    yield* Console.log(tok)
  })
).pipe(
  Command.withDescription("Get the tunnel token")
)

// --- Root tunnel command ---

export const tunnel = Command.make("tunnel").pipe(
  Command.withDescription("Named tunnel management"),
  Command.withSubcommands([create, list, info, del, run_, stop, logs, token])
)
