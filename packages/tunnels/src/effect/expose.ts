import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { Effect, Scope } from "effect"
import { BinaryInstallError, TunnelProcessError } from "./errors.js"
import { CloudflaredBinary } from "./services/CloudflaredBinary.js"

/**
 * Quick-exposes a local port via an anonymous Cloudflare tunnel.
 *
 * @param port Local port to expose through trycloudflare.
 * @returns An Effect that succeeds with the generated URL and closes the tunnel when the scope closes.
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

    const proc = spawn(binaryPath, ["tunnel", "--url", `http://localhost:${port}`], {
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
      const rl = createInterface({ input: proc.stderr! })
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
