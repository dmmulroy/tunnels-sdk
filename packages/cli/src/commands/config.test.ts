import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { config } from "./config.js"
import { ConfigService } from "../services.js"
import { TestLayer } from "../test-layer.js"

const run = Command.runWith(config, { version: "0.1.0" })

const makeFullConfigService = () => ConfigService.of({
  validate: () => Effect.succeed({ valid: true, warnings: [] }),
  diff: () => Effect.succeed({
    added: ["ingress[1]: api.example.com"],
    removed: ["ingress[2]: old.example.com"],
    unchanged: ["ingress[0]: app.example.com"],
  }),
  push: () => Effect.void,
  pull: () => Effect.succeed("tunnel: my-app\ningress:\n  - hostname: app.example.com\n    service: http://localhost:3000"),
  init: () => Effect.succeed("tunnel: my-app\ningress:\n  - hostname: app.example.com\n    service: http://localhost:3000\n  - service: http_status:404"),
})

describe("tunnels config", () => {
  it.effect("validate reports valid config", () =>
    Effect.gen(function* () {
      yield* run(["validate"]).pipe(
        Effect.provideService(ConfigService, makeFullConfigService())
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("valid"))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("validate reports warnings", () =>
    Effect.gen(function* () {
      const service = ConfigService.of({
        ...makeFullConfigService(),
        validate: () => Effect.succeed({
          valid: true,
          warnings: ["Missing explicit catch-all rule"],
        }),
      })
      yield* run(["validate"]).pipe(
        Effect.provideService(ConfigService, service)
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("catch-all"))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("diff shows added and removed rules", () =>
    Effect.gen(function* () {
      yield* run(["diff"]).pipe(
        Effect.provideService(ConfigService, makeFullConfigService())
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("api.example.com"))
      assert.isTrue(text.includes("old.example.com"))
      assert.isTrue(text.includes("+"))
      assert.isTrue(text.includes("-"))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("push applies config", () =>
    Effect.gen(function* () {
      yield* run(["push"]).pipe(
        Effect.provideService(ConfigService, makeFullConfigService())
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("pushed") || text.includes("applied") || text.includes("Config"))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("push --dry-run does not apply", () =>
    Effect.gen(function* () {
      yield* run(["push", "--dry-run"]).pipe(
        Effect.provideService(ConfigService, makeFullConfigService())
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.toLowerCase().includes("dry"))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("pull downloads remote config", () =>
    Effect.gen(function* () {
      yield* run(["pull"]).pipe(
        Effect.provideService(ConfigService, makeFullConfigService())
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("tunnel: my-app"))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("init generates a config scaffold", () =>
    Effect.gen(function* () {
      yield* run(["init"]).pipe(
        Effect.provideService(ConfigService, makeFullConfigService())
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("tunnel:"))
      assert.isTrue(text.includes("ingress:"))
    }).pipe(Effect.provide(TestLayer))
  )
})
