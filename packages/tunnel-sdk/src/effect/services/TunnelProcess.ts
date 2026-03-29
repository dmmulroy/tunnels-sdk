import { Effect, Layer, Ref, Scope, ServiceMap, Stream, SubscriptionRef } from "effect"
import { TunnelProcessError, BinaryInstallError } from "../errors.js"
import type { ConnectorInfo, LogEntry, TunnelMetrics, TunnelStatus } from "../schemas.js"
import { CloudflaredBinary } from "./CloudflaredBinary.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TunnelProcessErrorInfo {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
  readonly connector?: ConnectorInfo
}

export interface ReconnectAttempt {
  readonly number: number
  readonly delay: number
  readonly connector: ConnectorInfo
}

export type TunnelEvent =
  | { readonly _tag: "Connected"; readonly connector: ConnectorInfo }
  | { readonly _tag: "Disconnected"; readonly connector: ConnectorInfo }
  | { readonly _tag: "Reconnecting"; readonly attempt: ReconnectAttempt }
  | { readonly _tag: "Error"; readonly error: TunnelProcessErrorInfo }
  | { readonly _tag: "Metrics"; readonly metrics: TunnelMetrics }
  | { readonly _tag: "Status"; readonly status: TunnelStatus }

export interface RunningTunnel {
  readonly events: Stream.Stream<TunnelEvent>
  readonly logs: Stream.Stream<LogEntry>
  readonly status: Effect.Effect<TunnelStatus>
  readonly connectors: Effect.Effect<ReadonlyArray<ConnectorInfo>>
  readonly waitUntilHealthy: Effect.Effect<void, TunnelProcessError>
  readonly exitCode: Effect.Effect<number, TunnelProcessError>
}

export interface RunOptions {
  readonly metrics?: string
  readonly logLevel?: "debug" | "info" | "warn" | "error"
  readonly gracePeriod?: string
  readonly retries?: number
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TunnelProcessService extends ServiceMap.Service<
  TunnelProcessService,
  {
    run(
      token: string,
      options?: RunOptions,
    ): Effect.Effect<RunningTunnel, TunnelProcessError | BinaryInstallError, Scope.Scope>
  }
>()("tunnel-sdk/TunnelProcess") {
  static readonly layer = Layer.effect(
    TunnelProcessService,
    Effect.gen(function* () {
      const binary = yield* CloudflaredBinary

      const run = (
        token: string,
        options?: RunOptions,
      ): Effect.Effect<RunningTunnel, TunnelProcessError | BinaryInstallError, Scope.Scope> =>
        Effect.gen(function* () {
          const binaryPath = yield* binary.ensureInstalled()

          // Build command args
          const args = ["tunnel", "--no-autoupdate", "run", "--token", token]
          if (options?.logLevel) args.push("--loglevel", options.logLevel)
          if (options?.metrics) args.push("--metrics", options.metrics)
          if (options?.gracePeriod) args.push("--grace-period", options.gracePeriod)
          if (options?.retries) args.push("--retries", String(options.retries))

          // State management
          const statusRef = yield* SubscriptionRef.make<TunnelStatus>("inactive")
          const connectorsRef = yield* Ref.make<ReadonlyArray<ConnectorInfo>>([])

          // Spawn the process
          const cp = yield* Effect.tryPromise({
            try: () => import("node:child_process"),
            catch: (cause) =>
              new TunnelProcessError({ message: "Failed to load child_process", cause }),
          })

          const proc = cp.spawn(binaryPath, args, {
            stdio: ["ignore", "pipe", "pipe"],
          })

          // Auto-kill on scope close
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              if (!proc.killed) proc.kill("SIGTERM")
            }),
          )

          // Track exit
          const exitPromise = new Promise<number>((resolve) => {
            proc.on("exit", (code: number | null) => resolve(code ?? 1))
            proc.on("error", () => resolve(1))
          })

          // TODO: Parse stderr for events, connectors, metrics
          const events: Stream.Stream<TunnelEvent> = Stream.empty
          const logs: Stream.Stream<LogEntry> = Stream.empty

          const waitUntilHealthy: Effect.Effect<void, TunnelProcessError> =
            SubscriptionRef.changes(statusRef).pipe(
              Stream.filter((s): s is "healthy" => s === "healthy"),
              Stream.take(1),
              Stream.runDrain,
            )

          const exitCode: Effect.Effect<number, TunnelProcessError> = Effect.tryPromise({
            try: () => exitPromise,
            catch: (cause) =>
              new TunnelProcessError({ message: "Process error", cause }),
          })

          return {
            events,
            logs,
            status: SubscriptionRef.get(statusRef),
            connectors: Ref.get(connectorsRef),
            waitUntilHealthy,
            exitCode,
          } satisfies RunningTunnel
        })

      return TunnelProcessService.of({ run })
    }),
  )
}
