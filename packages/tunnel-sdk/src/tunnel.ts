import type { ApiClient } from "./api/client.js"
import type { CfTunnel } from "./api/types.js"
import type {
  TunnelStatus,
  TunnelConnection,
  RunOptions,
  DeleteOptions,
} from "./types.js"
import { IngressManager } from "./managers/ingress.js"
import { DnsManager } from "./managers/dns.js"
import { RouteManager } from "./managers/routes.js"
import { TunnelProcess } from "./process.js"
import { cloudflared } from "./bin/cloudflared.js"

/** Maps Cloudflare API tunnel to our Tunnel object */
function mapConnection(conn: CfTunnel["connections"][number]): TunnelConnection {
  return {
    id: conn.id,
    colo: conn.colo_name,
    ip: conn.origin_ip,
    location: conn.colo_name, // CF uses colo code as location identifier
    openedAt: new Date(conn.opened_at),
    clientVersion: conn.client_version,
    isPendingReconnect: conn.is_pending_reconnect,
  }
}

/**
 * Represents a Cloudflare Tunnel with full lifecycle management.
 *
 * Provides access to ingress rules, DNS records, routes, and running the tunnel.
 */
export class Tunnel {
  readonly id: string
  readonly name: string
  readonly status: TunnelStatus
  readonly createdAt: Date
  readonly deletedAt: Date | null
  readonly connections: TunnelConnection[]
  readonly remoteConfig: boolean

  /** Manage ingress rules */
  readonly ingress: IngressManager
  /** Manage DNS CNAME records */
  readonly dns: DnsManager
  /** Manage private network routes */
  readonly routes: RouteManager

  private readonly api: ApiClient
  private _token: string | null = null
  private readonly binaryPath?: string

  constructor(data: CfTunnel, api: ApiClient, binaryPath?: string) {
    this.id = data.id
    this.name = data.name
    this.status = data.status as TunnelStatus
    this.createdAt = new Date(data.created_at)
    this.deletedAt = data.deleted_at ? new Date(data.deleted_at) : null
    this.connections = (data.connections ?? []).map(mapConnection)
    this.remoteConfig = data.remote_config

    this.api = api
    this.binaryPath = binaryPath
    this.ingress = new IngressManager(api, this.id)
    this.dns = new DnsManager(api, this.id)
    this.routes = new RouteManager(api, this.id)
  }

  /** Get the tunnel token (for running on other machines) */
  async getToken(): Promise<string> {
    if (this._token) return this._token

    const token = await this.api.get<string>(
      this.api.accountPath(`/cfd_tunnel/${this.id}/token`),
    )
    this._token = token
    return token
  }

  /** Run the tunnel (starts cloudflared process) */
  async run(options?: RunOptions): Promise<TunnelProcess> {
    const token = await this.getToken()
    const binPath = this.binaryPath ?? cloudflared.path

    // Ensure binary is installed
    if (!this.binaryPath && !(await cloudflared.isInstalled())) {
      await cloudflared.install()
    }

    return TunnelProcess.start(binPath, token, options)
  }

  /** Delete this tunnel */
  async delete(options?: DeleteOptions): Promise<void> {
    const params: Record<string, string> = {}
    if (options?.force) params.cascade = "true"

    await this.api.delete(
      this.api.accountPath(`/cfd_tunnel/${this.id}`),
    )

    if (options?.cleanupDns) {
      const records = await this.dns.list()
      for (const record of records) {
        await this.dns.remove(record.hostname)
      }
    }
  }
}
