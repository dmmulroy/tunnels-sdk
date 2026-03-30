import { Console, Effect } from "effect"
import { Argument, Command } from "effect/unstable/cli"
import { IngressService, type IngressRuleInfo } from "../services.js"
import { printData, printResult, type Column } from "../output.js"

const ingressColumns: ReadonlyArray<Column<IngressRuleInfo>> = [
  { header: "HOSTNAME", value: (r) => r.hostname },
  { header: "SERVICE", value: (r) => r.service },
]

const add = Command.make("add", {
  hostname: Argument.string("hostname").pipe(
    Argument.withDescription("Public hostname")
  ),
  service: Argument.string("service").pipe(
    Argument.withDescription("Local service URL")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* IngressService
    yield* api.add(config.hostname, config.service)
    yield* printResult(
      { hostname: config.hostname, service: config.service },
      `✓ Ingress rule added: ${config.hostname} → ${config.service}`,
    )
  })
).pipe(Command.withDescription("Add an ingress rule"))

const list = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const api = yield* IngressService
    const rules = yield* api.list()
    yield* printData(rules, ingressColumns)
  })
).pipe(Command.withDescription("List ingress rules"))

const remove = Command.make("remove", {
  hostname: Argument.string("hostname").pipe(
    Argument.withDescription("Hostname to remove")
  ),
}, (config) =>
  Effect.gen(function* () {
    const api = yield* IngressService
    yield* api.remove(config.hostname)
    yield* printResult(
      { removed: config.hostname },
      `✓ Ingress rule removed: ${config.hostname}`,
    )
  })
).pipe(Command.withDescription("Remove an ingress rule"))

export const ingress = Command.make("ingress").pipe(
  Command.withDescription("Ingress rule management"),
  Command.withSubcommands([add, list, remove])
)
