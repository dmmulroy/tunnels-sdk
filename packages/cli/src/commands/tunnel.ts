import { Console, Effect, Option } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { TunnelApiService, type TunnelInfo } from "../services.js"
import { printData, printResult, printSingle, type Column } from "../output.js"

export const create = Command.make("create", {
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
    yield* printResult(
      { id: tunnel.id, name: tunnel.name, status: tunnel.status ?? "inactive" },
      `✓ Tunnel "${tunnel.name}" created (id: ${tunnel.id})`,
    )
  })
).pipe(
  Command.withDescription("Create a new named tunnel")
)

const tunnelColumns: ReadonlyArray<Column<TunnelInfo>> = [
  { header: "NAME", value: (t) => t.name },
  { header: "STATUS", value: (t) => t.status ?? "unknown" },
  { header: "CONNS", value: (t) => String(t.connections ?? 0) },
]

export const list = Command.make("list", {
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

export const info = Command.make("info", {
  ref: Argument.string("name-or-id").pipe(
    Argument.withDescription("Tunnel name or ID")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* TunnelApiService
    const t = yield* api.get(config.ref)
    yield* printSingle(
      { id: t.id, name: t.name, status: t.status ?? "unknown", connections: t.connections ?? 0 },
      [
        { label: "Name:", key: "name" },
        { label: "ID:", key: "id" },
        { label: "Status:", key: "status" },
        { label: "Connections:", key: "connections" },
      ],
    )
  })
).pipe(
  Command.withDescription("Show tunnel details")
)

export const del = Command.make("delete", {
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
    yield* printResult(
      { deleted: config.ref },
      `✓ Tunnel "${config.ref}" deleted`,
    )
  })
).pipe(
  Command.withDescription("Delete a tunnel")
)

export const run_ = Command.make("run", {
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

export const stop = Command.make("stop", {
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

export const logs = Command.make("logs", {
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

export const token = Command.make("token", {
  ref: Argument.string("name-or-id").pipe(
    Argument.withDescription("Tunnel name or ID")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* TunnelApiService
    const tok = yield* api.getToken(config.ref)
    yield* printResult(
      { token: tok },
      tok,
    )
  })
).pipe(
  Command.withDescription("Get the tunnel token")
)

// All tunnel commands are exported individually and registered
// as top-level subcommands in main.ts
