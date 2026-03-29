import type { IApiClient } from "./api/interfaces.js"
import type { CfTunnel } from "./api/types.js"
import type { IngressRule } from "./managers/ingress/index.js"
import type { BinaryResolver, DeleteOptions, TunnelStatus } from "./tunnel.js"
import { Tunnel, type ProcessFactory } from "./tunnel.js"
import { TunnelNotFoundError, TunnelSdkError } from "./errors.js"

export interface TunnelListOptions {
  status?: TunnelStatus
  /** Exact tunnel name filter */
  name?: string
  /** Alias for `name`. Filters by exact tunnel name (not fuzzy search). Cannot be combined with `name`. */
  search?: string
}

export interface CreateTunnelOptions {
  ingress?: IngressRule[]
  dns?: { auto?: boolean; cleanup?: boolean }
  routes?: Array<{ network: string; vnet?: string; comment?: string }>
}

export class TunnelOperations {
  constructor(
    private readonly api: IApiClient,
    private readonly binaryPath?: string,
    private readonly processFactory?: ProcessFactory,
    private readonly binaryResolver?: BinaryResolver,
  ) {}

  private tunnelDeps() {
    return {
      api: this.api,
      binaryPath: this.binaryPath,
      processFactory: this.processFactory,
      binaryResolver: this.binaryResolver,
    }
  }

  async create(name: string, options?: CreateTunnelOptions): Promise<Tunnel> {
    const cfTunnel = await this.api.post<CfTunnel>(
      this.api.accountPath("/cfd_tunnel"),
      { name, tunnel_secret: generateSecret(), config_src: "cloudflare" },
    )

    const tunnel = new Tunnel(cfTunnel, this.tunnelDeps())

    if (options?.ingress?.length) {
      await tunnel.ingress.set(options.ingress)
    }

    if (options?.dns?.auto && options?.ingress) {
      for (const rule of options.ingress) {
        if (rule.hostname) {
          await tunnel.dns.ensure(rule.hostname)
        }
      }
    }

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

  async list(options?: TunnelListOptions): Promise<Tunnel[]> {
    if (options?.name && options.search) {
      throw new TunnelSdkError('Use either "name" or "search", not both')
    }

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

    return tunnels.map((tunnel) => new Tunnel(tunnel, this.tunnelDeps()))
  }

  async *listAll(): AsyncGenerator<Tunnel> {
    for await (const tunnel of this.api.paginate<CfTunnel>(
      this.api.accountPath("/cfd_tunnel"),
      { is_deleted: "false" },
    )) {
      yield new Tunnel(tunnel, this.tunnelDeps())
    }
  }

  async get(nameOrId: string): Promise<Tunnel> {
    if (isUuid(nameOrId)) {
      const cfTunnel = await this.api.get<CfTunnel>(
        this.api.accountPath(`/cfd_tunnel/${nameOrId}`),
      )
      return new Tunnel(cfTunnel, this.tunnelDeps())
    }

    const tunnels = await this.list({ name: nameOrId })
    const match = tunnels.find((tunnel) => tunnel.name === nameOrId)
    if (!match) throw new TunnelNotFoundError(nameOrId)
    return match
  }

  async delete(nameOrId: string, options?: DeleteOptions): Promise<void> {
    const tunnel = await this.get(nameOrId)
    await tunnel.delete(options)
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function generateSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString("base64")
}
