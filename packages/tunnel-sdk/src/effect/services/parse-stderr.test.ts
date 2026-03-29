import { describe, it, assert } from "@effect/vitest"
import { Effect, Option, Ref, Stream, SubscriptionRef } from "effect"
import { parseLine, toEvent, processStderr, applyEvents } from "./parse-stderr.js"
import type { TunnelStatus } from "../schemas.js"
import { ConnectorInfo } from "../schemas.js"
import { PassThrough } from "node:stream"

describe("parseLine", () => {
  it("parses valid cloudflared JSON into a LogEntry", () => {
    const line = JSON.stringify({
      level: "info",
      time: "2024-01-15T10:30:00Z",
      event: "tunnelConnection",
      message: "Registered tunnel connection",
      connectorID: "abc123",
    })
    const result = parseLine(line)
    assert.isTrue(Option.isSome(result))
    const entry = Option.getOrThrow(result)
    assert.strictEqual(entry.level, "info")
    assert.strictEqual(entry.event, "tunnelConnection")
    assert.strictEqual(entry.message, "Registered tunnel connection")
    assert.strictEqual(entry.connectorId, "abc123")
    assert.deepStrictEqual(entry.timestamp, new Date("2024-01-15T10:30:00Z"))
  })

  it("returns None for non-JSON input", () => {
    assert.isTrue(Option.isNone(parseLine("not json at all")))
    assert.isTrue(Option.isNone(parseLine("")))
    assert.isTrue(Option.isNone(parseLine("{broken")))
  })

  it("normalizes cloudflared short level codes", () => {
    const make = (level: string) =>
      JSON.stringify({ level, time: "2024-01-15T10:30:00Z", event: "test", message: "m" })
    const lvl = (line: string) => Option.getOrThrow(parseLine(line)).level

    assert.strictEqual(lvl(make("INF")), "info")
    assert.strictEqual(lvl(make("WRN")), "warn")
    assert.strictEqual(lvl(make("ERR")), "error")
    assert.strictEqual(lvl(make("DBG")), "debug")
    assert.strictEqual(lvl(make("FTL")), "error")
    assert.strictEqual(lvl(make("warning")), "warn")
    assert.strictEqual(lvl(make("fatal")), "error")
  })

  it("returns None when level is missing or unrecognized", () => {
    const noLevel = JSON.stringify({ time: "2024-01-15T10:30:00Z", message: "hi" })
    assert.isTrue(Option.isNone(parseLine(noLevel)))

    const badLevel = JSON.stringify({ level: "TRACE", time: "2024-01-15T10:30:00Z", message: "hi" })
    assert.isTrue(Option.isNone(parseLine(badLevel)))
  })
})

describe("toEvent", () => {
  const connLine = JSON.stringify({
    level: "info",
    time: "2024-01-15T10:30:00Z",
    event: "tunnelConnection",
    message: "Registered tunnel connection",
    connectorID: "c1",
    location: "DFW",
    ip: "1.2.3.4",
    colo: "DFW",
  })

  it("maps tunnelConnection to Connected event", () => {
    const result = toEvent(connLine)
    assert.isTrue(Option.isSome(result))
    const event = Option.getOrThrow(result)
    assert.strictEqual(event._tag, "Connected")
    if (event._tag === "Connected") {
      assert.strictEqual(event.connector.id, "c1")
      assert.strictEqual(event.connector.colo, "DFW")
      assert.strictEqual(event.connector.ip, "1.2.3.4")
      assert.strictEqual(event.connector.location, "DFW")
    }
  })

  it("maps tunnelDisconnect to Disconnected event", () => {
    const line = JSON.stringify({
      level: "warn",
      time: "2024-01-15T10:31:00Z",
      event: "tunnelDisconnect",
      message: "Lost connection",
      connectorID: "c2",
      location: "LAX",
      ip: "5.6.7.8",
      colo: "LAX",
    })
    const event = Option.getOrThrow(toEvent(line))
    assert.strictEqual(event._tag, "Disconnected")
    if (event._tag === "Disconnected") {
      assert.strictEqual(event.connector.id, "c2")
    }
  })

  it("maps reconnect to Reconnecting event", () => {
    const line = JSON.stringify({
      level: "info",
      time: "2024-01-15T10:32:00Z",
      event: "reconnect",
      message: "Reconnecting",
      connectorID: "c1",
      location: "DFW",
      ip: "1.2.3.4",
      colo: "DFW",
      retryNumber: 3,
      retryDelay: 5000,
    })
    const event = Option.getOrThrow(toEvent(line))
    assert.strictEqual(event._tag, "Reconnecting")
    if (event._tag === "Reconnecting") {
      assert.strictEqual(event.attempt.number, 3)
      assert.strictEqual(event.attempt.delay, 5000)
      assert.strictEqual(event.attempt.connector.id, "c1")
    }
  })

  it("maps error to Error event", () => {
    const line = JSON.stringify({
      level: "error",
      time: "2024-01-15T10:33:00Z",
      event: "error",
      message: "connection refused",
      code: "ERR_CONN_REFUSED",
      retryable: true,
      connectorID: "c1",
      location: "DFW",
      ip: "1.2.3.4",
      colo: "DFW",
    })
    const event = Option.getOrThrow(toEvent(line))
    assert.strictEqual(event._tag, "Error")
    if (event._tag === "Error") {
      assert.strictEqual(event.error.code, "ERR_CONN_REFUSED")
      assert.strictEqual(event.error.message, "connection refused")
      assert.isTrue(event.error.retryable)
      assert.isDefined(event.error.connector)
    }
  })

  it("maps metrics to Metrics event", () => {
    const line = JSON.stringify({
      level: "info",
      time: "2024-01-15T10:34:00Z",
      event: "metrics",
      message: "Tunnel metrics",
      rps: 100,
      p50Ms: 5,
      p99Ms: 50,
      activeConns: 4,
      bytesIn: 1024,
      bytesOut: 2048,
    })
    const event = Option.getOrThrow(toEvent(line))
    assert.strictEqual(event._tag, "Metrics")
    if (event._tag === "Metrics") {
      assert.strictEqual(event.metrics.rps, 100)
      assert.strictEqual(event.metrics.p50Ms, 5)
      assert.strictEqual(event.metrics.p99Ms, 50)
      assert.strictEqual(event.metrics.activeConns, 4)
      assert.strictEqual(event.metrics.bytesIn, 1024)
      assert.strictEqual(event.metrics.bytesOut, 2048)
    }
  })

  it("returns None for non-event log lines", () => {
    const line = JSON.stringify({
      level: "info",
      time: "2024-01-15T10:30:00Z",
      event: "startup",
      message: "Starting tunnel",
    })
    assert.isTrue(Option.isNone(toEvent(line)))
  })

  it("returns None for non-JSON input", () => {
    assert.isTrue(Option.isNone(toEvent("garbage")))
  })
})

describe("processStderr", () => {
  function makeFakeStderr(lines: string[]): NodeJS.ReadableStream {
    const stream = new PassThrough()
    setTimeout(() => {
      for (const line of lines) {
        stream.write(line + "\n")
      }
      stream.end()
    }, 5)
    return stream as unknown as NodeJS.ReadableStream
  }

  it.effect("emits parsed LogEntry values on logs stream", () =>
    Effect.gen(function* () {
      const stderr = makeFakeStderr([
        JSON.stringify({ level: "info", time: "2024-01-15T10:30:00Z", event: "startup", message: "Starting" }),
        JSON.stringify({ level: "warn", time: "2024-01-15T10:30:01Z", event: "tunnelConnection", message: "Connected", connectorID: "c1", colo: "DFW", ip: "1.2.3.4", location: "DFW" }),
      ])

      const { logs } = yield* processStderr(stderr)
      const entries = yield* logs.pipe(Stream.runCollect)
      const arr = Array.from(entries)
      assert.strictEqual(arr.length, 2)
      assert.strictEqual(arr[0].level, "info")
      assert.strictEqual(arr[0].event, "startup")
      assert.strictEqual(arr[1].level, "warn")
      assert.strictEqual(arr[1].connectorId, "c1")
    }).pipe(Effect.scoped),
  )

  it.effect("emits TunnelEvent values on events stream", () =>
    Effect.gen(function* () {
      const stderr = makeFakeStderr([
        JSON.stringify({ level: "info", time: "2024-01-15T10:30:00Z", event: "startup", message: "Starting" }),
        JSON.stringify({ level: "info", time: "2024-01-15T10:30:01Z", event: "tunnelConnection", message: "Connected", connectorID: "c1", colo: "DFW", ip: "1.2.3.4", location: "DFW" }),
        JSON.stringify({ level: "info", time: "2024-01-15T10:30:02Z", event: "metrics", message: "Metrics", rps: 50, p50Ms: 2, p99Ms: 20, activeConns: 2, bytesIn: 512, bytesOut: 1024 }),
      ])

      const { events } = yield* processStderr(stderr)
      const evts = yield* events.pipe(Stream.runCollect)
      const arr = Array.from(evts)
      // Only tunnelConnection and metrics are events; startup is not
      assert.strictEqual(arr.length, 2)
      assert.strictEqual(arr[0]._tag, "Connected")
      assert.strictEqual(arr[1]._tag, "Metrics")
    }).pipe(Effect.scoped),
  )

  it.effect("skips malformed lines without crashing", () =>
    Effect.gen(function* () {
      const stderr = makeFakeStderr([
        "not json",
        JSON.stringify({ level: "info", time: "2024-01-15T10:30:00Z", event: "startup", message: "Starting" }),
        "{broken",
        JSON.stringify({ level: "warn", time: "2024-01-15T10:30:01Z", event: "tunnelDisconnect", message: "Lost", connectorID: "c2", colo: "LAX", ip: "5.6.7.8", location: "LAX" }),
      ])

      const { logs } = yield* processStderr(stderr)
      const logArr = yield* logs.pipe(Stream.runCollect)
      // Only 2 valid JSON lines with recognized levels
      assert.strictEqual(Array.from(logArr).length, 2)
    }).pipe(Effect.scoped),
  )

  it.effect("updates statusRef and connectorsRef on Connected events", () =>
    Effect.gen(function* () {
      const stderr = makeFakeStderr([
        JSON.stringify({
          level: "info", time: "2024-01-15T10:30:00Z",
          event: "tunnelConnection", message: "Connected",
          connectorID: "c1", colo: "DFW", ip: "1.2.3.4", location: "DFW",
        }),
        JSON.stringify({
          level: "info", time: "2024-01-15T10:30:01Z",
          event: "tunnelConnection", message: "Connected",
          connectorID: "c2", colo: "LAX", ip: "5.6.7.8", location: "LAX",
        }),
      ])

      const statusRef = yield* SubscriptionRef.make<TunnelStatus>("inactive")
      const connectorsRef = yield* Ref.make<ReadonlyArray<ConnectorInfo>>([])

      const { events } = yield* processStderr(stderr)
      yield* applyEvents(events, statusRef, connectorsRef)

      const status = yield* SubscriptionRef.get(statusRef)
      assert.strictEqual(status, "healthy")

      const conns = yield* Ref.get(connectorsRef)
      assert.strictEqual(conns.length, 2)
      assert.strictEqual(conns[0].id, "c1")
      assert.strictEqual(conns[1].id, "c2")
    }).pipe(Effect.scoped),
  )

  it.effect("updates connectorsRef on Disconnected events", () =>
    Effect.gen(function* () {
      const stderr = makeFakeStderr([
        JSON.stringify({
          level: "info", time: "2024-01-15T10:30:00Z",
          event: "tunnelConnection", message: "Connected",
          connectorID: "c1", colo: "DFW", ip: "1.2.3.4", location: "DFW",
        }),
        JSON.stringify({
          level: "info", time: "2024-01-15T10:30:01Z",
          event: "tunnelDisconnect", message: "Disconnected",
          connectorID: "c1", colo: "DFW", ip: "1.2.3.4", location: "DFW",
        }),
      ])

      const statusRef = yield* SubscriptionRef.make<TunnelStatus>("inactive")
      const connectorsRef = yield* Ref.make<ReadonlyArray<ConnectorInfo>>([])

      const { events } = yield* processStderr(stderr)
      yield* applyEvents(events, statusRef, connectorsRef)

      const conns = yield* Ref.get(connectorsRef)
      assert.strictEqual(conns.length, 0)

      const status = yield* SubscriptionRef.get(statusRef)
      assert.strictEqual(status, "degraded")
    }).pipe(Effect.scoped),
  )
})
