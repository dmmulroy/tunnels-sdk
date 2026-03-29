import { Cause, Effect, Option, Queue, Ref, Scope, Stream, SubscriptionRef } from "effect"
import { ConnectorInfo, LogEntry } from "../schemas.js"
import type { TunnelStatus } from "../schemas.js"
import type { TunnelEvent } from "./TunnelProcess.js"
import * as readline from "node:readline"

type RawJson = Record<string, unknown>

// ---------------------------------------------------------------------------
// parseLine — parse a single cloudflared stderr JSON line into a LogEntry
// ---------------------------------------------------------------------------

export function parseLine(line: string): Option.Option<LogEntry> {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(line)
  } catch {
    return Option.none()
  }

  if (typeof raw !== "object" || raw === null) return Option.none()

  const level = normalizeLevel(raw.level)
  if (level === undefined) return Option.none()

  const message = typeof raw.message === "string" ? raw.message : ""
  const event = typeof raw.event === "string" ? raw.event : ""
  const time = typeof raw.time === "string" ? raw.time : undefined
  const connectorId =
    typeof raw.connectorID === "string" ? raw.connectorID : undefined

  const timestamp = time ? new Date(time) : new Date()
  if (isNaN(timestamp.getTime())) return Option.none()

  return Option.some(
    new LogEntry({ timestamp, level, event, message, connectorId }),
  )
}

// ---------------------------------------------------------------------------
// normalizeLevel — map cloudflared level strings to LogLevel
// ---------------------------------------------------------------------------

const LEVEL_MAP: Record<string, "info" | "warn" | "error" | "debug"> = {
  info: "info",
  INF: "info",
  warn: "warn",
  WRN: "warn",
  warning: "warn",
  error: "error",
  ERR: "error",
  fatal: "error",
  FTL: "error",
  debug: "debug",
  DBG: "debug",
}

// ---------------------------------------------------------------------------
// toEvent — derive a TunnelEvent from a raw cloudflared JSON line
// ---------------------------------------------------------------------------

export function toEvent(line: string): Option.Option<TunnelEvent> {
  let raw: RawJson
  try {
    raw = JSON.parse(line)
  } catch {
    return Option.none()
  }

  const event = typeof raw.event === "string" ? raw.event : ""

  switch (event) {
    case "tunnelConnection":
      return Option.some({
        _tag: "Connected" as const,
        connector: extractConnector(raw),
      })
    case "tunnelDisconnect":
      return Option.some({
        _tag: "Disconnected" as const,
        connector: extractConnector(raw),
      })
    case "reconnect":
      return Option.some({
        _tag: "Reconnecting" as const,
        attempt: {
          number: typeof raw.retryNumber === "number" ? raw.retryNumber : 0,
          delay: typeof raw.retryDelay === "number" ? raw.retryDelay : 0,
          connector: extractConnector(raw),
        },
      })
    case "error":
      return Option.some({
        _tag: "Error" as const,
        error: {
          code: typeof raw.code === "string" ? raw.code : "UNKNOWN",
          message: typeof raw.message === "string" ? raw.message : "",
          retryable: raw.retryable === true,
          connector:
            typeof raw.connectorID === "string"
              ? extractConnector(raw)
              : undefined,
        },
      })
    case "metrics":
      return Option.some({
        _tag: "Metrics" as const,
        metrics: {
          rps: num(raw.rps),
          p50Ms: num(raw.p50Ms),
          p99Ms: num(raw.p99Ms),
          activeConns: num(raw.activeConns),
          bytesIn: num(raw.bytesIn),
          bytesOut: num(raw.bytesOut),
        },
      })
    default:
      return Option.none()
  }
}

function extractConnector(raw: RawJson): ConnectorInfo {
  return new ConnectorInfo({
    id: typeof raw.connectorID === "string" ? raw.connectorID : "",
    colo: typeof raw.colo === "string" ? raw.colo : "",
    ip: typeof raw.ip === "string" ? raw.ip : "",
    location: typeof raw.location === "string" ? raw.location : "",
  })
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0
}

function normalizeLevel(
  raw: unknown,
): "info" | "warn" | "error" | "debug" | undefined {
  if (typeof raw !== "string") return undefined
  return LEVEL_MAP[raw]
}

// ---------------------------------------------------------------------------
// processStderr — bridge a Node ReadableStream into Effect log + event streams
// ---------------------------------------------------------------------------

export interface StderrStreams {
  readonly logs: Stream.Stream<LogEntry>
  readonly events: Stream.Stream<TunnelEvent>
}

/**
 * Bridge a Node ReadableStream (cloudflared stderr) into Effect log + event
 * streams. Returns `StderrStreams` with a `logs` stream of parsed LogEntry
 * values and an `events` stream of derived TunnelEvent values.
 *
 * Malformed lines are silently skipped.
 *
 * Internally uses two `Stream.callback` queues fed by a single readline
 * instance so both streams can be consumed independently.
 */
export function processStderr(
  stderr: NodeJS.ReadableStream,
): Effect.Effect<StderrStreams, never, Scope.Scope> {
  return Effect.gen(function* () {
    // Two queues — one for log entries, one for events.
    // The readline "line" handler pushes to both synchronously.
    const logQueue = yield* Queue.unbounded<LogEntry, Cause.Done>()
    const eventQueue = yield* Queue.unbounded<TunnelEvent, Cause.Done>()

    const rl = readline.createInterface({ input: stderr })

    rl.on("line", (line: string) => {
      const entry = parseLine(line)
      if (Option.isSome(entry)) {
        Queue.offerUnsafe(logQueue, entry.value)
      }
      const evt = toEvent(line)
      if (Option.isSome(evt)) {
        Queue.offerUnsafe(eventQueue, evt.value)
      }
    })

    rl.on("close", () => {
      Queue.endUnsafe(logQueue)
      Queue.endUnsafe(eventQueue)
    })

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => rl.close()),
    )

    return {
      logs: Stream.fromQueue(logQueue),
      events: Stream.fromQueue(eventQueue),
    } satisfies StderrStreams
  })
}

// ---------------------------------------------------------------------------
// applyEvents — consume an event stream and update status + connectors refs
// ---------------------------------------------------------------------------

export const applyEvents = (
  events: Stream.Stream<TunnelEvent>,
  statusRef: SubscriptionRef.SubscriptionRef<TunnelStatus>,
  connectorsRef: Ref.Ref<ReadonlyArray<ConnectorInfo>>,
): Effect.Effect<void> =>
  events.pipe(
    Stream.runForEach((event) =>
      Effect.gen(function* () {
        switch (event._tag) {
          case "Connected":
            yield* Ref.update(connectorsRef, (cs) => [...cs, event.connector])
            yield* SubscriptionRef.set(statusRef, "healthy")
            break
          case "Disconnected":
            yield* Ref.update(connectorsRef, (cs) =>
              cs.filter((c) => c.id !== event.connector.id),
            )
            // If no connectors left, mark degraded
            const remaining = yield* Ref.get(connectorsRef)
            yield* SubscriptionRef.set(
              statusRef,
              remaining.length > 0 ? "healthy" : "degraded",
            )
            break
          case "Error":
            yield* SubscriptionRef.set(statusRef, "degraded")
            break
          case "Status":
            yield* SubscriptionRef.set(statusRef, event.status)
            break
        }
      }),
    ),
  )
