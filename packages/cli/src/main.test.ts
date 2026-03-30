import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { tunnels } from "./main.js"
import { TestLayer } from "./test-layer.js"

const run = Command.runWith(tunnels, { version: "0.1.0" })

describe("tunnels root command", () => {
  it.effect("prints version with --version", () =>
    Effect.gen(function* () {
      yield* run(["--version"])
      const output = yield* TestConsole.logLines
      assert.isTrue(output.some((line) => String(line).includes("0.1.0")))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("prints help with --help listing all subcommands", () =>
    Effect.gen(function* () {
      yield* run(["--help"])
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("")
      for (const cmd of ["expose", "create", "list", "info", "delete", "run", "stop", "logs", "token", "ingress", "route", "dns", "vnet", "config", "auth", "status", "dev"]) {
        assert.isTrue(text.includes(cmd), `help should include "${cmd}"`)
      }
    }).pipe(Effect.provide(TestLayer))
  )
})
