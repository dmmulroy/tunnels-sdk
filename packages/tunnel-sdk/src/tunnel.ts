import type { IApiClient } from "./api/interfaces.js"
import type { CfTunnel } from "./api/types.js"
import { LogStream } from "./logs.js"
import type { LogEntry } from "./logs.js"
import { DnsManager } from "./managers/dns/index.js"
import { IngressManager } from "./managers/ingress/index.js"
import { RouteManager } from "./managers/routes/index.js"
import { TunnelProcess, type RunOptions } from "./process.js"

export type TunnelStatus = "healthy" | "inactive" | "degraded" | "down"

export interface TunnelConnection {
  id: string
  colo: string
  ip: string
  location: string
  openedAt: Date
  clientVersion: string
  isPendingReconnect: boolean
}

export interface DeleteOptions {
  force?: boolean
  cleanupDns?: boolean
}

export interface BinaryResolver {
  readonly path: string
  isInstalled(): Promise<boolean>
  install(): Promise<void>
}

export interface ProcessFactory {
  start(binaryPath: string, token: string, options?: RunOptions): TunnelProcess
}

export interface TunnelDeps {
  api: IApiClient
  binaryPath?: string
  binaryResolver?: BinaryResolver
  processFactory?: ProcessFactory
}

const VALID_STATUSES = new Set<TunnelStatus>(["healthy", "inactive", "degraded", "down"])

function toTunnelStatus(raw: string): TunnelStatus {
  return VALID_STATUSES.has(raw as TunnelStatus) ? (raw as TunnelStatus) : "inactive"
}

function mapConnection(connection: CfTunnel["connections"][number]): TunnelConnection {
  return {
    id: connection.id,
    colo: connection.colo_name,
    ip: connection.origin_ip,
    location: connection.colo_name,
    openedAt: new Date(connection.opened_at),
    clientVersion: connection.client_version,
    isPendingReconnect: connection.is_pending_reconnect,
  }
}

export class Tunnel {
  id: string
  name: string
  status: TunnelStatus
  createdAt: Date
  deletedAt: Date | null
  connections: TunnelConnection[]
  remoteConfig: boolean

  readonly ingress: IngressManager
  readonly dns: DnsManager
  readonly routes: RouteManager

  private readonly api: IApiClient
  private readonly binaryPath?: string
  private readonly binaryResolver?: BinaryResolver
  private readonly processFactory: ProcessFactory
  private token: string | null = null
  private lastProcess: TunnelProcess | null = null

  constructor(data: CfTunnel, deps: TunnelDeps) {
    this.api = deps.api
    this.binaryPath = deps.binaryPath
    this.binaryResolver = deps.binaryResolver
    this.processFactory = deps.processFactory ?? { start: TunnelProcess.start }
    this.ingress = new IngressManager(deps.api, data.id)
    this.dns = new DnsManager(deps.api, data.id)
    this.routes = new RouteManager(deps.api, data.id)

    this.id = data.id
    this.name = data.name
    this.status = toTunnelStatus(data.status)
    this.createdAt = new Date(data.created_at)
    this.deletedAt = data.deleted_at ? new Date(data.deleted_at) : null
    this.connections = (data.connections ?? []).map(mapConnection)
    this.remoteConfig = data.remote_config
  }

  async refresh(): Promise<this> {
    const latest = await this.api.get<CfTunnel>(
      this.api.accountPath(`/cfd_tunnel/${this.id}`),
    )

    this.name = latest.name
    this.status = toTunnelStatus(latest.status)
    this.createdAt = new Date(latest.created_at)
    this.deletedAt = latest.deleted_at ? new Date(latest.deleted_at) : null
    this.connections = (latest.connections ?? []).map(mapConnection)
    this.remoteConfig = latest.remote_config

    return this
  }

  async getToken(): Promise<string> {
    if (this.token) return this.token

    this.token = await this.api.get<string>(
      this.api.accountPath(`/cfd_tunnel/${this.id}/token`),
    )

    return this.token
  }

  async run(options?: RunOptions): Promise<TunnelProcess> {
    const token = await this.getToken()

    let resolvedPath = this.binaryPath
    if (!resolvedPath) {
      const resolver = this.binaryResolver ?? (await import("./bin/cloudflared.js")).cloudflared
      resolvedPath = resolver.path
      if (!(await resolver.isInstalled())) {
        await resolver.install()
      }
    }

    const process = this.processFactory.start(resolvedPath, token, options)
    this.lastProcess = process
    return process
  }

  logs(options?: { level?: LogEntry["level"]; since?: string; signal?: AbortSignal }): LogStream {
    const proc = this.lastProcess
    if (!proc) {
      throw new Error("No running tunnel process. Call tunnel.run() first.")
    }

    const stderr = proc.stderr
    if (!stderr) {
      throw new Error("Tunnel process has no readable stderr stream")
    }

    return new LogStream(stderr, options)
  }

  async delete(options?: DeleteOptions): Promise<void> {
    if (options?.cleanupDns) {
      const records = await this.dns.list()
      for (const record of records) {
        await this.dns.remove(record.hostname)
      }
    }

    await this.api.delete(
      this.api.accountPath(`/cfd_tunnel/${this.id}`),
      options?.force ? { cascade: "true" } : undefined,
    )
  }
}
