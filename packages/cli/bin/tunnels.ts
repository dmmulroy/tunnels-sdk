#!/usr/bin/env node
import { Console, Effect, Layer } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Command } from "effect/unstable/cli"
import { tunnels } from "../src/main.js"
import { CliError, toExitCode } from "../src/errors.js"
import { OutputContext, type OutputFormat } from "../src/output.js"
import { LiveLayerFromEnv } from "../src/live-layer.js"

// Parse global flags from argv for OutputContext
const argv = process.argv.slice(2)
const hasFlag = (name: string) => argv.includes(`--${name}`)
const getFlagValue = (name: string) => {
  const idx = argv.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined
}

const outputCtx: OutputContext = {
  format: (getFlagValue("format") as OutputFormat) ?? (hasFlag("json") ? "json" : "table"),
  json: hasFlag("json"),
  quiet: hasFlag("quiet") || argv.includes("-q"),
}

const program = Command.run(tunnels, { version: "0.1.0" }).pipe(
  Effect.provideService(OutputContext, outputCtx),
  Effect.provide(Layer.mergeAll(LiveLayerFromEnv(), NodeServices.layer)),
  Effect.catch((error) => {
    if (typeof error === "object" && error !== null && "_tag" in error) {
      const tag = (error as { _tag: string })._tag

      // CLI framework errors (help, version, parse) — already handled
      if (tag.startsWith("~effect/cli/")) return Effect.void

      // CliError variants → meaningful exit codes
      const cliError = error as CliError
      if ("message" in cliError) {
        const prefix = tag === "AuthError" ? "Auth error"
          : tag === "NetworkError" ? "Network error"
          : tag === "TunnelRuntimeError" ? "Tunnel error"
          : "Error"
        return Console.error(`${prefix}: ${cftError.message}`).pipe(
          Effect.andThen(Effect.sync(() => process.exit(toExitCode(cliError))))
        )
      }
    }
    return Effect.die(error)
  })
)

NodeRuntime.runMain(program)
