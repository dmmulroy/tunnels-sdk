import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { create, list, info, del, run_, stop, logs, token } from "./tunnel.js"
import { TunnelApiService, type TunnelApi, type TunnelInfo } from "../services.js"
import { CliError } from "../errors.js"
import { OutputContext, defaultOutputContext } from "../output.js"
import { TestLayer } from "../test-layer.js"

interface CreatedTunnel {
  readonly name: string
  readonly dns: boolean
}

const makeTestTunnelApi = Effect.gen(function* () {
  const created = yield* Ref.make<ReadonlyArray<CreatedTunnel>>([])
  const deleted = yield* Ref.make<ReadonlyArray<{ ref: string; force: boolean }>>([])
  const tunnelList = yield* Ref.make<ReadonlyArray<TunnelInfo>>([
    { id: "abc-123", name: "my-app", status: "healthy", connections: 4 },
    { id: "def-456", name: "staging", status: "inactive", connections: 0 },
  ])

  return {
    service: TunnelApiService.of({
      create: (name, opts) =>
        Effect.gen(function* () {
          yield* Ref.update(created, (arr) => [...arr, { name, dns: opts?.dns ?? false }])
          return { id: "new-tunnel-id", name }
        }),
      list: (opts) =>
        Effect.gen(function* () {
          const all = yield* Ref.get(tunnelList)
          if (opts?.status) return all.filter((t) => t.status === opts.status)
          return all
        }),
      get: (ref) =>
        Effect.gen(function* () {
          const all = yield* Ref.get(tunnelList)
          const found = all.find((t) => t.id === ref || t.name === ref)
          if (!found) return yield* Effect.fail(new Error(`Not found: ${ref}`))
          return found
        }),
      delete: (ref, opts) =>
        Effect.gen(function* () {
          yield* Ref.update(deleted, (arr) => [...arr, { ref, force: opts?.force ?? false }])
        }),
      run: () => Effect.void,
      stop: () => Effect.void,
      getLogs: () => Effect.succeed([]),
      getToken: () => Effect.succeed("test-token"),
    }),
    getCreated: Ref.get(created),
    getDeleted: Ref.get(deleted),
  }
})

const runCreate = Command.runWith(create, { version: "0.1.0" })
const runList = Command.runWith(list, { version: "0.1.0" })
const runInfo = Command.runWith(info, { version: "0.1.0" })
const runDel = Command.runWith(del, { version: "0.1.0" })
const runRun = Command.runWith(run_, { version: "0.1.0" })
const runStop = Command.runWith(stop, { version: "0.1.0" })
const runLogs = Command.runWith(logs, { version: "0.1.0" })
const runToken = Command.runWith(token, { version: "0.1.0" })

const makeNoopApi = (): TunnelApi => ({
  create: () => Effect.die("unused"),
  list: () => Effect.die("unused"),
  get: () => Effect.die("unused"),
  delete: () => Effect.die("unused"),
  run: () => Effect.die("unused"),
  stop: () => Effect.die("unused"),
  getLogs: () => Effect.die("unused"),
  getToken: () => Effect.die("unused"),
})

describe("tunnel commands", () => {
  describe("create", () => {
    it.effect("creates a tunnel by name", () =>
      Effect.gen(function* () {
        const { service, getCreated } = yield* makeTestTunnelApi
        yield* runCreate(["my-tunnel"]).pipe(
          Effect.provideService(TunnelApiService, service)
        )
        const output = yield* TestConsole.logLines
        const text = output.map(String).join("\n")
        assert.isTrue(text.includes("my-tunnel"))
        assert.isTrue(text.includes("new-tunnel-id"))

        const created = yield* getCreated
        assert.deepStrictEqual(created, [{ name: "my-tunnel", dns: false }])
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("creates a tunnel with --dns flag", () =>
      Effect.gen(function* () {
        const { service, getCreated } = yield* makeTestTunnelApi
        yield* runCreate(["my-tunnel", "--dns"]).pipe(
          Effect.provideService(TunnelApiService, service)
        )
        const created = yield* getCreated
        assert.deepStrictEqual(created, [{ name: "my-tunnel", dns: true }])
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("list", () => {
    it.effect("lists all tunnels", () =>
      Effect.gen(function* () {
        const { service } = yield* makeTestTunnelApi
        yield* runList([]).pipe(
          Effect.provideService(TunnelApiService, service),
          Effect.provideService(OutputContext, defaultOutputContext)
        )
        const output = yield* TestConsole.logLines
        const text = output.map(String).join("\n")
        assert.isTrue(text.includes("my-app"))
        assert.isTrue(text.includes("staging"))
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("filters tunnels by --status", () =>
      Effect.gen(function* () {
        const { service } = yield* makeTestTunnelApi
        yield* runList(["--status", "healthy"]).pipe(
          Effect.provideService(TunnelApiService, service),
          Effect.provideService(OutputContext, defaultOutputContext)
        )
        const output = yield* TestConsole.logLines
        const text = output.map(String).join("\n")
        assert.isTrue(text.includes("my-app"))
        assert.isFalse(text.includes("staging"))
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("outputs JSON when OutputContext format is json", () =>
      Effect.gen(function* () {
        const { service } = yield* makeTestTunnelApi
        yield* runList([]).pipe(
          Effect.provideService(TunnelApiService, service),
          Effect.provideService(OutputContext, { ...defaultOutputContext, json: true })
        )
        const output = yield* TestConsole.logLines
        const text = output.map(String).join("\n")
        const parsed = JSON.parse(text)
        assert.isArray(parsed)
        assert.strictEqual(parsed.length, 2)
        assert.strictEqual(parsed[0].name, "my-app")
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("info", () => {
    it.effect("shows tunnel details by name", () =>
      Effect.gen(function* () {
        const { service } = yield* makeTestTunnelApi
        yield* runInfo(["my-app"]).pipe(
          Effect.provideService(TunnelApiService, service)
        )
        const output = yield* TestConsole.logLines
        const text = output.map(String).join("\n")
        assert.isTrue(text.includes("my-app"))
        assert.isTrue(text.includes("abc-123"))
        assert.isTrue(text.includes("healthy"))
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("delete", () => {
    it.effect("deletes a tunnel by name", () =>
      Effect.gen(function* () {
        const { service, getDeleted } = yield* makeTestTunnelApi
        yield* runDel(["my-app"]).pipe(
          Effect.provideService(TunnelApiService, service)
        )
        const output = yield* TestConsole.logLines
        const text = output.map(String).join("\n")
        assert.isTrue(text.includes("my-app"))

        const deleted = yield* getDeleted
        assert.deepStrictEqual(deleted, [{ ref: "my-app", force: false }])
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("deletes a tunnel with --force", () =>
      Effect.gen(function* () {
        const { service, getDeleted } = yield* makeTestTunnelApi
        yield* runDel(["my-app", "--force"]).pipe(
          Effect.provideService(TunnelApiService, service)
        )
        const deleted = yield* getDeleted
        assert.deepStrictEqual(deleted, [{ ref: "my-app", force: true }])
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("run", () => {
    it.effect("runs a tunnel by name", () =>
      Effect.gen(function* () {
        const ran = yield* Ref.make<ReadonlyArray<string>>([])
        const service = TunnelApiService.of({
          ...makeNoopApi(),
          run: (ref) => Ref.update(ran, (arr) => [...arr, ref]),
        })
        yield* runRun(["my-app"]).pipe(
          Effect.provideService(TunnelApiService, service)
        )
        const output = yield* TestConsole.logLines
        assert.isTrue(output.map(String).join("\n").includes("my-app"))
        const calls = yield* Ref.get(ran)
        assert.deepStrictEqual(calls, ["my-app"])
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("stop", () => {
    it.effect("stops a tunnel by name", () =>
      Effect.gen(function* () {
        const stopped = yield* Ref.make<ReadonlyArray<string>>([])
        const service = TunnelApiService.of({
          ...makeNoopApi(),
          stop: (ref) => Ref.update(stopped, (arr) => [...arr, ref]),
        })
        yield* runStop(["my-app"]).pipe(
          Effect.provideService(TunnelApiService, service)
        )
        const output = yield* TestConsole.logLines
        assert.isTrue(output.map(String).join("\n").includes("my-app"))
        const calls = yield* Ref.get(stopped)
        assert.deepStrictEqual(calls, ["my-app"])
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("logs", () => {
    it.effect("shows tunnel logs", () =>
      Effect.gen(function* () {
        const service = TunnelApiService.of({
          ...makeNoopApi(),
          getLogs: () => Effect.succeed([
            { timestamp: "2025-01-01T00:00:00Z", level: "info", message: "connected" },
            { timestamp: "2025-01-01T00:00:01Z", level: "info", message: "serving" },
          ]),
        })
        yield* runLogs(["my-app"]).pipe(
          Effect.provideService(TunnelApiService, service)
        )
        const output = yield* TestConsole.logLines
        const text = output.map(String).join("\n")
        assert.isTrue(text.includes("connected"))
        assert.isTrue(text.includes("serving"))
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("token", () => {
    it.effect("displays the tunnel token", () =>
      Effect.gen(function* () {
        const service = TunnelApiService.of({
          ...makeNoopApi(),
          getToken: () => Effect.succeed("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9"),
        })
        yield* runToken(["my-app"]).pipe(
          Effect.provideService(TunnelApiService, service)
        )
        const output = yield* TestConsole.logLines
        const text = output.map(String).join("\n")
        assert.isTrue(text.includes("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9"))
      }).pipe(Effect.provide(TestLayer))
    )
  })

  describe("error handling", () => {
    it.effect("info shows error when tunnel is not found", () =>
      Effect.gen(function* () {
        const service = TunnelApiService.of({
          ...makeNoopApi(),
          get: (ref) => Effect.fail(CliError.NetworkError({ message: `Tunnel not found: "${ref}"` })),
        })
        const result = yield* runInfo(["nonexistent"]).pipe(
          Effect.provideService(TunnelApiService, service),
          Effect.exit
        )
        assert.isTrue(result._tag === "Failure")
      }).pipe(Effect.provide(TestLayer))
    )

    it.effect("list shows error on network failure", () =>
      Effect.gen(function* () {
        const service = TunnelApiService.of({
          ...makeNoopApi(),
          list: () => Effect.fail(CliError.NetworkError({ message: "Connection refused" })),
        })
        const result = yield* runList([]).pipe(
          Effect.provideService(TunnelApiService, service),
          Effect.provideService(OutputContext, defaultOutputContext),
          Effect.exit
        )
        assert.isTrue(result._tag === "Failure")
      }).pipe(Effect.provide(TestLayer))
    )
  })
})
