import { Console, Effect } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"
import { VNetService, type VNetInfo } from "../services.js"
import { printData, type Column } from "../output.js"

const vnetColumns: ReadonlyArray<Column<VNetInfo>> = [
  { header: "NAME", value: (v) => v.name },
  { header: "DEFAULT", value: (v) => v.isDefault ? "yes" : "no" },
]

const create = Command.make("create", {
  name: Argument.string("name").pipe(
    Argument.withDescription("Virtual network name")
  ),
  isDefault: Flag.boolean("default").pipe(
    Flag.withDescription("Set as default virtual network")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* VNetService
    yield* api.create(config.name, { isDefault: config.isDefault })
    yield* Console.log(`✓ Virtual network "${config.name}" created`)
  })
).pipe(Command.withDescription("Create a virtual network"))

const list = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const api = yield* VNetService
    const vnets = yield* api.list()
    yield* printData(vnets, vnetColumns)
  })
).pipe(Command.withDescription("List virtual networks"))

const del = Command.make("delete", {
  name: Argument.string("name").pipe(
    Argument.withDescription("Virtual network to delete")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* VNetService
    yield* api.delete(config.name)
    yield* Console.log(`✓ Virtual network "${config.name}" deleted`)
  })
).pipe(Command.withDescription("Delete a virtual network"))

export const vnet = Command.make("vnet").pipe(
  Command.withDescription("Virtual network management"),
  Command.withSubcommands([create, list, del])
)
