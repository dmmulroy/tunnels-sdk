/**
 * E2E test helper — spawns the real `tunnels` CLI binary as a child process.
 *
 * Uses `tsx` to run the TypeScript entry point directly (no build step needed).
 */
import { spawn, type ChildProcess } from "node:child_process"
import path from "node:path"

// Resolve paths relative to this file → packages/cli/test/helpers/
const CLI_ROOT = path.resolve(import.meta.dirname, "../..")
const BIN_PATH = path.join(CLI_ROOT, "bin/tunnels.ts")

export interface CliResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface RunCliOptions {
  /** Extra environment variables (merged with process.env) */
  readonly env?: Record<string, string | undefined>
  /** Timeout in ms (default: 10_000) */
  readonly timeout?: number
  /** Working directory */
  readonly cwd?: string
}

/**
 * Run the CLI with the given arguments and return captured output.
 * Resolves when the process exits.
 */
export function runCli(
  args: string[],
  options: RunCliOptions = {},
): Promise<CliResult> {
  const { timeout = 10_000, cwd, env: extraEnv } = options

  // Build environment: start from process.env, merge extras.
  // `undefined` values remove the key (useful for stripping auth vars).
  const childEnv: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) childEnv[k] = v
  }
  if (extraEnv) {
    for (const [k, v] of Object.entries(extraEnv)) {
      if (v === undefined) {
        delete childEnv[k]
      } else {
        childEnv[k] = v
      }
    }
  }

  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx/esm", "--no-warnings", BIN_PATH, ...args],
      {
        env: childEnv,
        cwd: cwd ?? CLI_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      },
    )

    let stdout = ""
    let stderr = ""
    let timedOut = false

    child.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeout)

    child.on("close", (code) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`CLI timed out after ${timeout}ms.\nstdout: ${stdout}\nstderr: ${stderr}`))
      } else {
        resolve({ stdout, stderr, exitCode: code ?? 1 })
      }
    })

    child.on("error", (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/**
 * Run the CLI and parse stdout as JSON.
 */
export async function runCliJson<T = unknown>(
  args: string[],
  options: RunCliOptions = {},
): Promise<{ data: T; result: CliResult }> {
  const result = await runCli(args, options)
  try {
    const data = JSON.parse(result.stdout.trim()) as T
    return { data, result }
  } catch {
    throw new Error(
      `Failed to parse CLI JSON output.\n` +
      `exitCode: ${result.exitCode}\n` +
      `stdout: ${result.stdout}\n` +
      `stderr: ${result.stderr}`,
    )
  }
}

/**
 * Spawn the CLI as a long-running process (e.g. `tunnels expose`).
 * Returns a handle for interacting with the process.
 */
export interface CliProcess {
  readonly child: ChildProcess
  /** Current accumulated stdout */
  stdout(): string
  /** Current accumulated stderr */
  stderr(): string
  /** Wait for a regex pattern to appear in stdout */
  waitForOutput(pattern: RegExp, timeoutMs?: number): Promise<RegExpMatchArray>
  /** Send a signal to the process */
  kill(signal?: NodeJS.Signals): void
  /** Wait for the process to exit and return the result */
  waitForExit(timeoutMs?: number): Promise<CliResult>
}

export function spawnCli(
  args: string[],
  options: RunCliOptions = {},
): CliProcess {
  const { cwd, env: extraEnv } = options

  const childEnv: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) childEnv[k] = v
  }
  if (extraEnv) {
    for (const [k, v] of Object.entries(extraEnv)) {
      if (v === undefined) {
        delete childEnv[k]
      } else {
        childEnv[k] = v
      }
    }
  }

  const child = spawn(
    process.execPath,
    ["--import", "tsx/esm", "--no-warnings", BIN_PATH, ...args],
    {
      env: childEnv,
      cwd: cwd ?? CLI_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    },
  )

  let stdoutBuf = ""
  let stderrBuf = ""
  let closed = false
  let exitCode = -1

  const stdoutListeners: Array<() => void> = []

  child.stdout!.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString()
    // Wake any waiters
    for (const fn of stdoutListeners) fn()
  })
  child.stderr!.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString()
  })
  child.on("close", (code) => {
    closed = true
    exitCode = code ?? 1
    for (const fn of stdoutListeners) fn()
  })

  return {
    child,
    stdout: () => stdoutBuf,
    stderr: () => stderrBuf,
    kill: (signal = "SIGTERM") => child.kill(signal),

    waitForOutput(pattern: RegExp, timeoutMs = 30_000): Promise<RegExpMatchArray> {
      return new Promise((resolve, reject) => {
        const check = () => {
          const m = pattern.exec(stdoutBuf)
          if (m) {
            cleanup()
            resolve(m)
            return true
          }
          if (closed) {
            cleanup()
            reject(
              new Error(
                `Process exited without matching ${pattern}.\nstdout: ${stdoutBuf}\nstderr: ${stderrBuf}`,
              ),
            )
            return true
          }
          return false
        }

        const timer = setTimeout(() => {
          cleanup()
          reject(
            new Error(
              `Timed out waiting for ${pattern} after ${timeoutMs}ms.\nstdout: ${stdoutBuf}\nstderr: ${stderrBuf}`,
            ),
          )
        }, timeoutMs)

        const listener = () => { check() }
        const cleanup = () => {
          clearTimeout(timer)
          const idx = stdoutListeners.indexOf(listener)
          if (idx >= 0) stdoutListeners.splice(idx, 1)
        }

        // Check existing buffer first
        if (!check()) {
          stdoutListeners.push(listener)
        }
      })
    },

    waitForExit(timeoutMs = 10_000): Promise<CliResult> {
      return new Promise((resolve, reject) => {
        if (closed) {
          resolve({ stdout: stdoutBuf, stderr: stderrBuf, exitCode })
          return
        }

        const timer = setTimeout(() => {
          child.kill("SIGKILL")
          reject(
            new Error(
              `Process did not exit within ${timeoutMs}ms.\nstdout: ${stdoutBuf}\nstderr: ${stderrBuf}`,
            ),
          )
        }, timeoutMs)

        child.on("close", () => {
          clearTimeout(timer)
          resolve({ stdout: stdoutBuf, stderr: stderrBuf, exitCode })
        })
      })
    },
  }
}
