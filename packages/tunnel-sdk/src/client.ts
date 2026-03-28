import { ApiClient } from "./api/client.js"
import type { CfTunnel } from "./api/types.js"
import type {
  TunnelClientOptions,
  TunnelListOptions,
  IngressRule,
  DeleteOptions,
} from "./types.js"
import { Tunnel } from "./tunnel.js"
import { TunnelNotFoundError } from "./errors.js"
import { VNetManager } from "./managers/vnets.js"

interface CreateTunnelOptions {
  ingress?: IngressRule[]
  dns?: { auto?: boolean; cleanup?: boolean }
  routes?: Array<{ network: string; vnet?: string; comment?: string }>
}

/**
 * Main entry point for managing Cloudflare Tunnels via the API.
 *
 * @example
 * ```ts
 * const client = new TunnelClient({
 *   accountId: process.env.CF_ACCOUNT_ID!,
 *   apiToken: process.env.CF_API_TOKEN!,
 * })
 *
 * const tunnel = await client.tunnels.create("my-app", {
 *   ingress: [{ hostname: "app.example.com", service: "http://localhost:3000" }],
 *   dns: { auto: true },
 * })
 * ```
 */
export class TunnelClient {
  private readonly api: ApiClient
  private readonly binaryPath?: string

  /** Tunnel CRUD operations */
  readonly tunnels: TunnelOperations
  /** Virtual network management */
  readonly vnets: VNetManager

  constructor(options: TunnelClientOptions) {
    this.api = new ApiClient({
      accountId: options.accountId,
      apiToken: options.apiToken,
      baseUrl: options.baseUrl,
    })
    this.binaryPath = options.binaryPath
    this.tunnels = new TunnelOperations(this.api, this.binaryPath)
    this.vnets = new VNetManager(this.api)
  }
}

class TunnelOperations {
  constructor(
    private readonly api: ApiClient,
    private readonly binaryPath?: string,
  ) {}

  /** Create a new tunnel */
  async create(name: string, options?: CreateTunnelOptions): Promise<Tunnel> {
    // 1. Create the tunnel via API
    const cfTunnel = await this.api.post<CfTunnel>(
      this.api.accountPath("/cfd_tunnel"),
      { name, tunnel_secret: generateSecret(), config_src: "cloudflare" },
    )

    const tunnel = new Tunnel(cfTunnel, this.api, this.binaryPath)

    // 2. Configure ingress if provided
    if (options?.ingress && options.ingress.length > 0) {
      await tunnel.ingress.set(options.ingress)
    }

    // 3. Auto-create DNS records if requested
    if (options?.dns?.auto && options?.ingress) {
      for (const rule of options.ingress) {
        if (rule.hostname) {
          await tunnel.dns.ensure(rule.hostname)
        }
      }
    }

    // 4. Add routes if provided
    if (options?.routes) {
      for (const route of options.routes) {
        await tunnel.routes.add(route.network, {
          vnet: route.vnet,
          comment: route.comment,
        })
      }
    }

    return tunnel
  }

  /** List tunnels with optional filters */
  async list(options?: TunnelListOptions): Promise<Tunnel[]> {
    const params: Record<string, string> = {
      is_deleted: "false",
    }

    if (options?.status) params.status = options.status
    if (options?.name) params.name = options.name
    if (options?.search) params.name = options.search

    const tunnels = await this.api.get<CfTunnel[]>(
      this.api.accountPath("/cfd_tunnel"),
      params,
    )

    return tunnels.map((t) => new Tunnel(t, this.api, this.binaryPath))
  }

  /** Auto-paginate through all tunnels */
  async *listAll(): AsyncGenerator<Tunnel> {
    for await (const t of this.api.paginate<CfTunnel>(
      this.api.accountPath("/cfd_tunnel"),
      { is_deleted: "false" },
    )) {
      yield new Tunnel(t, this.api, this.binaryPath)
    }
  }

  /** Get a tunnel by name or ID */
  async get(nameOrId: string): Promise<Tunnel> {
    // Try as UUID first
    if (isUuid(nameOrId)) {
      const cfTunnel = await this.api.get<CfTunnel>(
        this.api.accountPath(`/cfd_tunnel/${nameOrId}`),
      )
      return new Tunnel(cfTunnel, this.api, this.binaryPath)
    }

    // Otherwise search by name
    const tunnels = await this.list({ name: nameOrId })
    const match = tunnels.find((t) => t.name === nameOrId)
    if (!match) throw new TunnelNotFoundError(nameOrId)
    return match
  }

  /** Delete a tunnel by name or ID */
  async delete(nameOrId: string, options?: DeleteOptions): Promise<void> {
    const tunnel = await this.get(nameOrId)
    await tunnel.delete(options)
  }
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function generateSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}
