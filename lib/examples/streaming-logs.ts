/**
 * Streaming logs example using the Effect SDK directly.
 *
 * The TunnelProcessService provides a RunningTunnel with event and log streams.
 * This example shows how to consume them with Effect Streams.
 */
import { Effect, Stream, Redacted } from "effect"
import {
  TunnelOperations,
  TunnelProcessService,
  LiveLayer,
  CloudflareApiConfig,
} from "tunnel-sdk/effect"

const config = new CloudflareApiConfig({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: Redacted.make(process.env.CF_API_TOKEN!),
})

const program = Effect.gen(function* () {
  const ops = yield* TunnelOperations
  const process = yield* TunnelProcessService

  // Get the tunnel and its token
  const tunnel = yield* ops.get("my-app")
  const token = yield* ops.getToken(tunnel.id)

  // Run the tunnel process (scoped — auto-cleans up when scope closes)
  const running = yield* process.run(token, { logLevel: "info" })

  // Wait for the tunnel to become healthy
  yield* running.waitUntilHealthy

  // Stream events — filter for status changes
  yield* running.events.pipe(
    Stream.filter((e) => e._tag === "Status"),
    Stream.take(10), // Take first 10 status events
    Stream.runForEach((e) =>
      Effect.log(`Status: ${e._tag === "Status" ? e.status : "unknown"}`),
    ),
  )

  // Stream logs — all log entries from the process
  yield* running.logs.pipe(
    Stream.take(100), // Take first 100 log entries
    Stream.runForEach((entry) =>
      Effect.log(`[${entry.level}] ${entry.message}`),
    ),
  )

  // Wait for the process to exit
  const code = yield* running.exitCode
  yield* Effect.log(`Tunnel exited with code ${code}`)
}).pipe(
  Effect.scoped,
  Effect.provide(LiveLayer(config)),
)

Effect.runPromise(program).catch(console.error)
