import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { ConfigService } from "../services.js"

const validate = Command.make("validate", {}, () =>
  Effect.gen(function* () {
    const svc = yield* ConfigService
    const result = yield* svc.validate()
    if (result.valid) {
      yield* Console.log("✓ Config valid.")
    } else {
      yield* Console.log("✗ Config invalid.")
    }
    for (const warning of result.warnings) {
      yield* Console.log(`⚠ ${warning}`)
    }
  })
).pipe(Command.withDescription("Validate config file"))

const diff = Command.make("diff", {}, () =>
  Effect.gen(function* () {
    const svc = yield* ConfigService
    const result = yield* svc.diff()
    for (const line of result.unchanged) {
      yield* Console.log(`  ${line}`)
    }
    for (const line of result.added) {
      yield* Console.log(`+ ${line}`)
    }
    for (const line of result.removed) {
      yield* Console.log(`- ${line}`)
    }
  })
).pipe(Command.withDescription("Diff local config vs remote"))

const push = Command.make("push", {
  dryRun: Flag.boolean("dry-run").pipe(
    Flag.withDescription("Show what would change without applying")
  ),
}, (config) =>
  Effect.gen(function* () {
    const svc = yield* ConfigService
    if (config.dryRun) {
      const result = yield* svc.diff()
      yield* Console.log("Dry run — changes that would be applied:")
      for (const line of result.added) yield* Console.log(`+ ${line}`)
      for (const line of result.removed) yield* Console.log(`- ${line}`)
    } else {
      yield* svc.push()
      yield* Console.log("✓ Config pushed to Cloudflare")
    }
  })
).pipe(Command.withDescription("Push config to Cloudflare"))

const pull = Command.make("pull", {}, () =>
  Effect.gen(function* () {
    const svc = yield* ConfigService
    const yaml = yield* svc.pull()
    yield* Console.log(yaml)
  })
).pipe(Command.withDescription("Pull remote config to local file"))

const init = Command.make("init", {}, () =>
  Effect.gen(function* () {
    const svc = yield* ConfigService
    const yaml = yield* svc.init()
    yield* Console.log(yaml)
  })
).pipe(Command.withDescription("Initialize a new config file"))

export const config = Command.make("config").pipe(
  Command.withDescription("Config file management"),
  Command.withSubcommands([validate, diff, push, pull, init])
)
