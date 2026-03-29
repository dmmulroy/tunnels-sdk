import type { ApiClient } from "./api/client.js"
import type { CfTunnel } from "./api/types.js"
import type { DeleteOptions, LogEntry, RunOptions, TunnelConnection, TunnelStatus } from "./types.js"
import { cloudflared } from "./bin/cloudflared.js"
import { LogStream } from "./logs.js"
import { DnsManager } from "./managers/dns.js"
import { IngressManager } from "./managers/ingress.js"
import { RouteManager } from "./managers/routes.js"
import { TunnelProcess } from "./process.js"

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

  private readonly api: ApiClient
  private readonly binaryPath?: string
  private token: string | null = null
  private lastProcess: TunnelProcess | null = null

  constructor(data: CfTunnel, api: ApiClient, binaryPath?: string) {
    this.api = api
    this.binaryPath = binaryPath
    this.ingress = new IngressManager(api, data.id)
    this.dns = new DnsManager(api, data.id)
    this.routes = new RouteManager(api, data.id)

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
    const binaryPath = this.binaryPath ?? cloudflared.path

    if (!this.binaryPath && !(await cloudflared.isInstalled())) {
      await cloudflared.install()
    }

    const process = TunnelProcess.start(binaryPath, token, options)
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
