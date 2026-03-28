import { spawn, type ChildProcess } from "node:child_process"
import { createInterface } from "node:readline"
import { EventEmitter } from "node:events"
import type {
  RunOptions,
  TunnelStatus,
  ConnectorInfo,
  ReconnectAttempt,
  TunnelError,
  TunnelMetrics,
  TunnelProcessEvents,
} from "./types.js"

type EventMap = TunnelProcessEvents

/**
 * A running tunnel process with typed events and lifecycle management.
 *
 * @example
 * ```ts
 * const connection = await tunnel.run()
 * await connection.waitUntilHealthy()
 *
 * connection.on("error", (err) => console.error(err))
 * connection.on("metrics", (m) => console.log(m.rps, "req/s"))
 *
 * await connection.waitUntilExit()
 * ```
 */
export class TunnelProcess {
  private readonly proc: ChildProcess
  private readonly emitter = new EventEmitter()
  private readonly _connectors: Map<string, ConnectorInfo> = new Map()
  private _status: TunnelStatus = "inactive"
  private _closed = false
  private _exitPromise: Promise<number>

  private constructor(proc: ChildProcess) {
    this.proc = proc
    this._exitPromise = new Promise<number>((resolve) => {
      proc.on("exit", (code) => {
        this._status = "down"
        this.emitter.emit("status", "down")
        this.emitter.emit("exit", code ?? 1)
        resolve(code ?? 1)
      })
    })

    this.parseOutput()
  }

  /** Start a tunnel process with a token */
  static start(binaryPath: string, token: string, options?: RunOptions): TunnelProcess {
    const args = ["tunnel", "--no-autoupdate", "run", "--token", token]

    if (options?.logLevel) args.push("--loglevel", options.logLevel)
    if (options?.metrics) args.push("--metrics", options.metrics)
    if (options?.gracePeriod) args.push("--grace-period", options.gracePeriod)
    if (options?.retries) args.push("--retries", String(options.retries))

    const proc = spawn(binaryPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    })

    const tunnelProcess = new TunnelProcess(proc)

    // Wire up abort signal
    if (options?.signal) {
      options.signal.addEventListener("abort", () => {
        tunnelProcess.close()
      })
    }

    return tunnelProcess
  }

  /** Current tunnel status */
  get status(): TunnelStatus {
    return this._status
  }

  /** Active connectors */
  get connectors(): ConnectorInfo[] {
    return Array.from(this._connectors.values())
  }

  /** Listen for typed events */
  on<K extends keyof EventMap>(event: K, listener: EventMap[K]): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void)
    return this
  }

  /** Remove event listener */
  off<K extends keyof EventMap>(event: K, listener: EventMap[K]): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void)
    return this
  }

  /** Wait for the tunnel to be healthy (4 connections established) */
  waitUntilHealthy(timeoutMs = 60_000): Promise<void> {
    if (this._status === "healthy") return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for healthy state (${timeoutMs}ms)`))
      }, timeoutMs)

      const onStatus = (status: TunnelStatus) => {
        if (status === "healthy") {
          clearTimeout(timeout)
          this.emitter.off("status", onStatus)
          this.emitter.off("exit", onExit)
          resolve()
        }
      }

      const onExit = (code: number) => {
        clearTimeout(timeout)
        this.emitter.off("status", onStatus)
        reject(new Error(`Tunnel process exited with code ${code} before becoming healthy`))
      }

      this.emitter.on("status", onStatus)
      this.emitter.once("exit", onExit)
    })
  }

  /** Wait for the tunnel process to exit */
  waitUntilExit(): Promise<number> {
    return this._exitPromise
  }

  /** Gracefully stop the tunnel */
  async close(): Promise<void> {
    if (this._closed) return
    this._closed = true

    this.proc.kill("SIGTERM")

    // Wait for graceful exit or force kill after 10s
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.proc.kill("SIGKILL")
        resolve()
      }, 10_000)

      this.proc.on("exit", () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  /** Explicit Resource Management */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close()
  }

  /** Parse cloudflared JSON log output and emit typed events */
  private parseOutput(): void {
    if (!this.proc.stderr) return

    const rl = createInterface({ input: this.proc.stderr })

    rl.on("line", (line) => {
      try {
        const entry = JSON.parse(line)
        this.handleLogEntry(entry)
      } catch {
        // Non-JSON line — some cloudflared output isn't JSON
        this.tryParseUnstructuredLine(line)
      }
    })
  }

  private handleLogEntry(entry: Record<string, unknown>): void {
    const event = entry.event as string | undefined
    const level = entry.level as string | undefined

    // Connection registered
    if (event === "registered" || event === "connectionRegistered" ||
        (typeof entry.connIndex === "number" && event?.includes("registered"))) {
      const connector: ConnectorInfo = {
        id: String(entry.connIndex ?? entry.connection ?? ""),
        colo: String(entry.location ?? entry.colo ?? ""),
        ip: String(entry.ip ?? ""),
        location: String(entry.location ?? entry.colo ?? ""),
      }
      this._connectors.set(connector.id, connector)
      this.emitter.emit("connected", connector)
      this.updateStatus()
    }

    // Connection disconnected
    if (event === "unregistered" || event === "connectionUnregistered" ||
        event === "disconnect") {
      const id = String(entry.connIndex ?? entry.connection ?? "")
      const connector = this._connectors.get(id)
      if (connector) {
        this._connectors.delete(id)
        this.emitter.emit("disconnected", connector)
        this.updateStatus()
      }
    }

    // Reconnecting
    if (event === "reconnecting" || entry.retryCount !== undefined) {
      const attempt: ReconnectAttempt = {
        number: Number(entry.retryCount ?? entry.retry ?? 0),
        delay: Number(entry.delay ?? 0),
        connector: {
          id: String(entry.connIndex ?? ""),
          colo: String(entry.location ?? ""),
          ip: String(entry.ip ?? ""),
          location: String(entry.location ?? ""),
        },
      }
      this.emitter.emit("reconnecting", attempt)
    }

    // Errors
    if (level === "error" || level === "fatal") {
      const err: TunnelError = {
        code: String(entry.error ?? entry.code ?? "unknown"),
        message: String(entry.message ?? entry.msg ?? entry.error ?? ""),
        retryable: level !== "fatal",
        connector: entry.connIndex !== undefined
          ? {
              id: String(entry.connIndex),
              colo: String(entry.location ?? ""),
              ip: String(entry.ip ?? ""),
              location: String(entry.location ?? ""),
            }
          : undefined,
      }
      this.emitter.emit("error", err)
    }
  }

  private tryParseUnstructuredLine(line: string): void {
    // Handle non-JSON output from cloudflared
    // e.g., "ERR  Something went wrong"
    if (line.includes("ERR") || line.includes("error")) {
      this.emitter.emit("error", {
        code: "unstructured",
        message: line.trim(),
        retryable: true,
      } satisfies TunnelError)
    }
  }

  private updateStatus(): void {
    const count = this._connectors.size
    let newStatus: TunnelStatus

    if (count >= 4) {
      newStatus = "healthy"
    } else if (count > 0) {
      newStatus = "degraded"
    } else {
      newStatus = "inactive"
    }

    if (newStatus !== this._status) {
      this._status = newStatus
      this.emitter.emit("status", newStatus)
    }
  }
}
