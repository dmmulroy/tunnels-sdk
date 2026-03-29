import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { status } from "./status.js"
import { TunnelApiService } from "../services.js"
import { OutputContext, defaultOutputContext } from "../output.js"
import { TestLayer } from "../test-layer.js"

const run = Command.runWith(status, { version: "0.1.0" })

const makeStatusService = () => TunnelApiService.of({
  create: () => Effect.die("unused"),
  list: () =>
    Effect.succeed([
      { id: "a", name: "my-app", status: "healthy", connections: 4, maxConnections: 4, uptime: "2d 14h", colo: "bos01, phl01" },
      { id: "b", name: "staging", status: "degraded", connections: 2, maxConnections: 4, uptime: "45m", colo: "iad01" },
    ]),
  get: () => Effect.die("unused"),
  delete: () => Effect.die("unused"),
  run: () => Effect.die("unused"),
  stop: () => Effect.die("unused"),
  getLogs: () => Effect.die("unused"),
  getToken: () => Effect.die("unused"),
})

describe("cft status", () => {
  it.effect("shows health summary with uptime, colo, and connection ratio", () =>
    Effect.gen(function* () {
      yield* run([]).pipe(
        Effect.provideService(TunnelApiService, makeStatusService()),
        Effect.provideService(OutputContext, defaultOutputContext)
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      // Should show all tunnel info
      assert.isTrue(text.includes("my-app"))
      assert.isTrue(text.includes("healthy"))
      assert.isTrue(text.includes("staging"))
      assert.isTrue(text.includes("degraded"))
      // Status-specific fields
      assert.isTrue(text.includes("4/4"), "should show connection ratio")
      assert.isTrue(text.includes("2d 14h"), "should show uptime")
      assert.isTrue(text.includes("bos01"), "should show colo")
    }).pipe(Effect.provide(TestLayer))
  )
})
