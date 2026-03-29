import { Console, Effect } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { RouteService, type RouteInfo } from "../services.js"
import { printData, type Column } from "../output.js"

const routeColumns: ReadonlyArray<Column<RouteInfo>> = [
  { header: "NETWORK", value: (r) => r.network },
  { header: "TUNNEL", value: (r) => r.tunnel },
]

const add = Command.make("add", {
  network: Argument.string("cidr").pipe(
    Argument.withDescription("CIDR range (e.g., 10.0.0.0/8)")
  ),
  tunnel: Flag.string("tunnel").pipe(
    Flag.withDescription("Tunnel name")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* RouteService
    yield* api.add(config.network, config.tunnel)
    yield* Console.log(`✓ Route added: ${config.network} → ${config.tunnel}`)
  })
).pipe(Command.withDescription("Add a private network route"))

const list = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const api = yield* RouteService
    const routes = yield* api.list()
    yield* printData(routes, routeColumns)
  })
).pipe(Command.withDescription("List routes"))

const remove = Command.make("remove", {
  network: Argument.string("cidr").pipe(
    Argument.withDescription("CIDR range to remove")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* RouteService
    yield* api.remove(config.network)
    yield* Console.log(`✓ Route removed: ${config.network}`)
  })
).pipe(Command.withDescription("Remove a route"))

export const route = Command.make("route").pipe(
  Command.withDescription("Private network route management"),
  Command.withSubcommands([add, list, remove])
)
