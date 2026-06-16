import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"

/**
 * CLI command for development-mode tunnel workflows.
 */
export const dev = Command.make("dev", {
  port: Flag.integer("port").pipe(
    Flag.withDescription("Local port to expose"),
    Flag.optional
  ),
  watch: Flag.boolean("watch").pipe(
    Flag.withDescription("Auto-reload on config change")
  ),
}, (config) =>
  Effect.gen(function* () {
    yield* Console.log("⚠ Dev mode is not yet implemented")
  })
).pipe(
  Command.withDescription("Development mode with watch")
)
