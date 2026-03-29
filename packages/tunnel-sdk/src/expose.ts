import { spawn as nodeSpawn, type ChildProcess } from "node:child_process"
import { createInterface } from "node:readline"
import type { BinaryResolver } from "./bin/index.js"
import type { ProcessSpawner } from "./process.js"

export interface ExposeOptions {
  binaryPath?: string
  binaryResolver?: BinaryResolver
  spawner?: ProcessSpawner
}

const defaultSpawner: ProcessSpawner = { spawn: nodeSpawn }

export interface QuickTunnel {
  readonly url: string
  close(): Promise<void>
  [Symbol.asyncDispose](): Promise<void>
}

export async function expose(port: number, options?: ExposeOptions): Promise<QuickTunnel> {
  const resolver: BinaryResolver = options?.binaryResolver ?? (await import("./bin/cloudflared.js")).cloudflared
  const spawner: ProcessSpawner = options?.spawner ?? defaultSpawner
  const binaryPath = options?.binaryPath ?? resolver.path

  if (!options?.binaryPath && !(await resolver.isInstalled())) {
    await resolver.install()
  }

  const proc = spawner.spawn(binaryPath, ["tunnel", "--url", `http://localhost:${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
  })

  const url = await waitForUrl(proc)
  let closed = false

  const close = async () => {
    if (closed) return
    closed = true

    proc.kill("SIGTERM")

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        proc.kill("SIGKILL")
        resolve()
      }, 5000)

      proc.once("exit", () => {
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

function waitForUrl(proc: ChildProcess): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL")
      reject(new Error("Timed out waiting for tunnel URL (30s)"))
    }, 30_000)

    let settled = false

    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }

    const tryMatch = (line: string) => {
      const match = line.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/)
      if (match) {
        settle(() => resolve(match[1]))
      }
    }

    if (proc.stderr) {
      createInterface({ input: proc.stderr }).on("line", tryMatch)
    }

    if (proc.stdout) {
      createInterface({ input: proc.stdout }).on("line", tryMatch)
    }

    proc.once("error", (error) => {
      settle(() => reject(new Error(`Failed to start cloudflared: ${error.message}`)))
    })

    proc.once("exit", (code) => {
      settle(() => reject(new Error(`cloudflared exited with code ${code} before providing a URL`)))
    })
  })
}
