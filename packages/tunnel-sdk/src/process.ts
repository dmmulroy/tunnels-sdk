import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process"
import { EventEmitter } from "node:events"
import { createInterface } from "node:readline"

export type TunnelStatus = "healthy" | "inactive" | "degraded" | "down"

export interface ProcessSpawner {
  spawn(command: string, args: string[], options: SpawnOptions): ChildProcess
}

export interface RunOptions {
  metrics?: string
  logLevel?: "debug" | "info" | "warn" | "error"
  gracePeriod?: string
  retries?: number
  signal?: AbortSignal
  spawner?: ProcessSpawner
}

export interface ConnectorInfo {
  id: string
  colo: string
  ip: string
  location: string
}

export interface ReconnectAttempt {
  number: number
  delay: number
  connector: ConnectorInfo
}

export interface TunnelError {
  code: string
  message: string
  retryable: boolean
  connector?: ConnectorInfo
}

export interface TunnelMetrics {
  rps: number
  p50Ms: number
  p99Ms: number
  activeConns: number
  bytesIn: number
  bytesOut: number
}

export interface TunnelProcessEvents {
  connected: (connector: ConnectorInfo) => void
  disconnected: (connector: ConnectorInfo) => void
  reconnecting: (attempt: ReconnectAttempt) => void
  error: (error: TunnelError) => void
  metrics: (metrics: TunnelMetrics) => void
  status: (status: TunnelStatus) => void
  exit: (code: number) => void
}

export interface ProcessFactory {
  start(binaryPath: string, token: string, options?: RunOptions): TunnelProcess
}

const defaultSpawner: ProcessSpawner = { spawn: nodeSpawn }

type TunnelProcessEvent = keyof TunnelProcessEvents

type EventPayloads = {
  [K in TunnelProcessEvent]: Parameters<TunnelProcessEvents[K]>
}

export class TunnelProcess {
  private readonly proc: ChildProcess
  private readonly emitter = new EventEmitter()
  private readonly connectorsById = new Map<string, ConnectorInfo>()
  private statusValue: TunnelStatus = "inactive"
  private closed = false
  private readonly exitPromise: Promise<number>

  private constructor(proc: ChildProcess) {
    this.proc = proc
    this.exitPromise = new Promise<number>((resolve) => {
      proc.on("exit", (code) => {
        this.statusValue = "down"
        this.emit("status", "down")
        this.emit("exit", code ?? 1)
        resolve(code ?? 1)
      })
    })

    this.parseOutput()
  }

  static start(binaryPath: string, token: string, options?: RunOptions): TunnelProcess {
    const args = ["tunnel", "--no-autoupdate", "run", "--token", token]

    if (options?.logLevel) args.push("--loglevel", options.logLevel)
    if (options?.metrics) args.push("--metrics", options.metrics)
    if (options?.gracePeriod) args.push("--grace-period", options.gracePeriod)
    if (options?.retries) args.push("--retries", String(options.retries))

    const spawnFn = options?.spawner ?? defaultSpawner
    const proc = spawnFn.spawn(binaryPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    })

    const tunnelProcess = new TunnelProcess(proc)

    if (options?.signal) {
      if (options.signal.aborted) {
        void tunnelProcess.close()
      } else {
        options.signal.addEventListener("abort", () => {
          void tunnelProcess.close()
        }, { once: true })
      }
    }

    return tunnelProcess
  }

  get status(): TunnelStatus {
    return this.statusValue
  }

  get connectors(): ConnectorInfo[] {
    return Array.from(this.connectorsById.values())
  }

  get stderr(): import("node:stream").Readable | null {
    return this.proc.stderr ?? null
  }

  on(event: "connected", listener: TunnelProcessEvents["connected"]): this
  on(event: "disconnected", listener: TunnelProcessEvents["disconnected"]): this
  on(event: "reconnecting", listener: TunnelProcessEvents["reconnecting"]): this
  on(event: "error", listener: TunnelProcessEvents["error"]): this
  on(event: "metrics", listener: TunnelProcessEvents["metrics"]): this
  on(event: "status", listener: TunnelProcessEvents["status"]): this
  on(event: "exit", listener: TunnelProcessEvents["exit"]): this
  on<K extends TunnelProcessEvent>(event: K, listener: TunnelProcessEvents[K]): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void)
    return this
  }

  off(event: "connected", listener: TunnelProcessEvents["connected"]): this
  off(event: "disconnected", listener: TunnelProcessEvents["disconnected"]): this
  off(event: "reconnecting", listener: TunnelProcessEvents["reconnecting"]): this
  off(event: "error", listener: TunnelProcessEvents["error"]): this
  off(event: "metrics", listener: TunnelProcessEvents["metrics"]): this
  off(event: "status", listener: TunnelProcessEvents["status"]): this
  off(event: "exit", listener: TunnelProcessEvents["exit"]): this
  off<K extends TunnelProcessEvent>(event: K, listener: TunnelProcessEvents[K]): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void)
    return this
  }

  waitUntilHealthy(timeoutMs = 60_000): Promise<void> {
    if (this.statusValue === "healthy") return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error(`Timed out waiting for healthy state (${timeoutMs}ms)`))
      }, timeoutMs)

      const onStatus = (status: TunnelStatus) => {
        if (status === "healthy") {
          cleanup()
          resolve()
        }
      }

      const onExit = (code: number) => {
        cleanup()
        reject(new Error(`Tunnel process exited with code ${code} before becoming healthy`))
      }

      const cleanup = () => {
        clearTimeout(timeout)
        this.emitter.off("status", onStatus)
        this.emitter.off("exit", onExit)
      }

      this.emitter.on("status", onStatus)
      this.emitter.once("exit", onExit)
    })
  }

  waitUntilExit(): Promise<number> {
    return this.exitPromise
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true

    this.proc.kill("SIGTERM")

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.proc.kill("SIGKILL")
        resolve()
      }, 10_000)

      this.proc.once("exit", () => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.close()
  }

  private emit<K extends TunnelProcessEvent>(event: K, ...args: EventPayloads[K]): void {
    this.emitter.emit(event, ...args)
  }

  private parseOutput(): void {
    if (!this.proc.stderr) return

    const lines = createInterface({ input: this.proc.stderr })
    lines.on("line", (line) => {
      try {
        this.handleLogEntry(JSON.parse(line) as Record<string, unknown>)
      } catch {
        this.tryParseUnstructuredLine(line)
      }
    })
  }

  private handleLogEntry(entry: Record<string, unknown>): void {
    const event = String(entry.event ?? "")
    const message = String(entry.message ?? entry.msg ?? "")
    const level = String(entry.level ?? "")

    // Check disconnect FIRST — "unregistered".includes("registered") is true,
    // so checking connect first would spuriously match disconnect events.
    if (isDisconnectedEvent(event, message)) {
      const id = String(entry.connIndex ?? entry.connection ?? "")
      const connector = this.connectorsById.get(id)
      if (connector) {
        this.connectorsById.delete(id)
        this.emit("disconnected", connector)
        this.updateStatus()
      }
    } else if (isConnectedEvent(event, message, entry)) {
      const connector: ConnectorInfo = {
        id: String(entry.connIndex ?? entry.connection ?? ""),
        colo: String(entry.location ?? entry.colo ?? ""),
        ip: String(entry.ip ?? ""),
        location: String(entry.location ?? entry.colo ?? ""),
      }
      this.connectorsById.set(connector.id, connector)
      this.emit("connected", connector)
      this.updateStatus()
    }

    if (event === "reconnecting" || entry.retryCount !== undefined || message.toLowerCase().includes("reconnect")) {
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
      this.emit("reconnecting", attempt)
    }

    const metrics = parseMetrics(entry)
    if (metrics) {
      this.emit("metrics", metrics)
    }

    if (level === "error" || level === "fatal") {
      const error: TunnelError = {
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
      this.emit("error", error)
    }
  }

  private tryParseUnstructuredLine(line: string): void {
    if (/\bERR(OR)?\b/i.test(line)) {
      this.emit("error", {
        code: "unstructured",
        message: line.trim(),
        retryable: true,
      })
    }
  }

  private updateStatus(): void {
    const connectorCount = this.connectorsById.size
    const nextStatus: TunnelStatus = connectorCount >= 4
      ? "healthy"
      : connectorCount > 0
        ? "degraded"
        : "inactive"

    if (nextStatus !== this.statusValue) {
      this.statusValue = nextStatus
      this.emit("status", nextStatus)
    }
  }
}

function isConnectedEvent(event: string, message: string, entry: Record<string, unknown>): boolean {
  return event === "registered"
    || event === "connectionRegistered"
    || message.includes("Registered tunnel connection")
    || (typeof entry.connIndex === "number" && event.toLowerCase().includes("registered"))
}

function isDisconnectedEvent(event: string, message: string): boolean {
  return event === "unregistered"
    || event === "connectionUnregistered"
    || event === "disconnect"
    || message.toLowerCase().includes("disconnect")
}

function parseMetrics(entry: Record<string, unknown>): TunnelMetrics | null {
  if (
    typeof entry.rps === "number"
    && typeof entry.p50Ms === "number"
    && typeof entry.p99Ms === "number"
    && typeof entry.activeConns === "number"
    && typeof entry.bytesIn === "number"
    && typeof entry.bytesOut === "number"
  ) {
    return {
      rps: entry.rps,
      p50Ms: entry.p50Ms,
      p99Ms: entry.p99Ms,
      activeConns: entry.activeConns,
      bytesIn: entry.bytesIn,
      bytesOut: entry.bytesOut,
    }
  }

  return null
}
