import { Effect, Scope, Stream } from "effect"
import { BinaryInstallError, TunnelProcessError } from "./errors.js"
import { CloudflaredBinary } from "./services/CloudflaredBinary.js"

/**
 * Quick-expose a local port via a Cloudflare tunnel (anonymous, no account needed).
 * Returns the generated trycloudflare URL. The tunnel is auto-closed when the scope closes.
 */
export const expose = (
  port: number,
): Effect.Effect<
  { readonly url: string },
  TunnelProcessError | BinaryInstallError,
  Scope.Scope | CloudflaredBinary
> =>
  Effect.gen(function* () {
    const binary = yield* CloudflaredBinary
    const binaryPath = yield* binary.ensureInstalled()

    const cp = yield* Effect.tryPromise({
      try: () => import("node:child_process"),
      catch: (cause) =>
        new TunnelProcessError({ message: "Failed to load child_process", cause }),
    })

    const readline = yield* Effect.tryPromise({
      try: () => import("node:readline"),
      catch: (cause) =>
        new TunnelProcessError({ message: "Failed to load readline", cause }),
    })

    const proc = cp.spawn(binaryPath, ["tunnel", "--url", `http://localhost:${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
    })

    // Auto-kill on scope close
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        if (!proc.killed) proc.kill("SIGTERM")
      }),
    )

    // Wait for the trycloudflare URL in stderr
    const url: string = yield* Effect.callback<string, TunnelProcessError>((resume) => {
      const rl = readline.createInterface({ input: proc.stderr! })
      const onLine = (line: string) => {
        const match = line.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/)
        if (match) {
          rl.off("line", onLine)
          resume(Effect.succeed(match[1]))
        }
      }
      rl.on("line", onLine)
      rl.on("close", () => {
        resume(
          Effect.fail(
            new TunnelProcessError({
              message: "Tunnel closed before URL was received",
            }),
          ),
        )
      })
      proc.on("error", (err: Error) => {
        resume(Effect.fail(new TunnelProcessError({ message: err.message })))
      })
    })

    return { url }
  })
