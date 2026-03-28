import { spawn, type ChildProcess } from "node:child_process"
import { createInterface } from "node:readline"
import { cloudflared } from "./bin/cloudflared.js"
import type { ExposeOptions } from "./types.js"

/** Result of `expose()` — a running quick tunnel */
export interface QuickTunnel {
  /** The public URL assigned by Cloudflare (e.g., https://abc123.trycloudflare.com) */
  readonly url: string
  /** Stop the tunnel and clean up */
  close(): Promise<void>
  /** Explicit Resource Management support */
  [Symbol.asyncDispose](): Promise<void>
}

/**
 * Expose a local port via a Cloudflare Quick Tunnel.
 *
 * Zero config, zero auth. Just a port number and you get a public URL.
 *
 * @example
 * ```ts
 * const tunnel = await expose(3000)
 * console.log(tunnel.url) // https://abc123.trycloudflare.com
 * await tunnel.close()
 * ```
 *
 * @example With `using` for automatic cleanup:
 * ```ts
 * await using tunnel = await expose(3000)
 * console.log(tunnel.url)
 * // tunnel.close() called automatically when scope exits
 * ```
 */
export async function expose(port: number, options?: ExposeOptions): Promise<QuickTunnel> {
  const binaryPath = options?.binaryPath ?? cloudflared.path

  // Ensure binary is installed
  if (!(await cloudflared.isInstalled())) {
    await cloudflared.install()
  }

  const args = ["tunnel", "--url", `http://localhost:${port}`]

  if (options?.protocol && options.protocol !== "http") {
    args.push("--protocol", options.protocol)
  }

  const proc = spawn(binaryPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
  })

  const url = await waitForUrl(proc)

  let closed = false

  const close = async () => {
    if (closed) return
    closed = true

    proc.kill("SIGTERM")

    // Wait for graceful exit or force kill after 5s
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill("SIGKILL")
        resolve()
      }, 5000)

      proc.on("exit", () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  return {
    url,
    close,
    [Symbol.asyncDispose]: close,
  }
}

/** Parse cloudflared output to extract the tunnel URL */
function waitForUrl(proc: ChildProcess): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL")
      reject(new Error("Timed out waiting for tunnel URL (30s)"))
    }, 30_000)

    let settled = false

    const tryMatch = (line: string) => {
      if (settled) return

      // cloudflared outputs the URL in various formats:
      // "INF |  https://abc123.trycloudflare.com"
      // or JSON: {"url":"https://..."}
      const urlMatch = line.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/)
      if (urlMatch) {
        settled = true
        clearTimeout(timeout)
        resolve(urlMatch[1])
      }
    }

    // cloudflared writes tunnel info to stderr
    if (proc.stderr) {
      const rl = createInterface({ input: proc.stderr })
      rl.on("line", tryMatch)
    }

    // Also check stdout just in case
    if (proc.stdout) {
      const rl = createInterface({ input: proc.stdout })
      rl.on("line", tryMatch)
    }

    proc.on("error", (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        reject(new Error(`Failed to start cloudflared: ${err.message}`))
      }
    })

    proc.on("exit", (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        reject(new Error(`cloudflared exited with code ${code} before providing a URL`))
      }
    })
  })
}
