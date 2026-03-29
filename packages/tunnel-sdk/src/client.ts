import { ApiClient } from "./api/client.js"
import type { CfTunnel } from "./api/types.js"
import type {
  DeleteOptions,
  IngressRule,
  TunnelClientOptions,
  TunnelListOptions,
} from "./types.js"
import { Tunnel } from "./tunnel.js"
import { TunnelNotFoundError, TunnelSdkError } from "./errors.js"
import { VNetManager } from "./managers/vnets.js"

interface CreateTunnelOptions {
  ingress?: IngressRule[]
  dns?: { auto?: boolean; cleanup?: boolean }
  routes?: Array<{ network: string; vnet?: string; comment?: string }>
}

export class TunnelClient {
  private readonly api: ApiClient
  private readonly binaryPath?: string

  readonly tunnels: TunnelOperations
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

  async create(name: string, options?: CreateTunnelOptions): Promise<Tunnel> {
    const cfTunnel = await this.api.post<CfTunnel>(
      this.api.accountPath("/cfd_tunnel"),
      { name, tunnel_secret: generateSecret(), config_src: "cloudflare" },
    )

    const tunnel = new Tunnel(cfTunnel, this.api, this.binaryPath)

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

    return tunnels.map((tunnel) => new Tunnel(tunnel, this.api, this.binaryPath))
  }

  async *listAll(): AsyncGenerator<Tunnel> {
    for await (const tunnel of this.api.paginate<CfTunnel>(
      this.api.accountPath("/cfd_tunnel"),
      { is_deleted: "false" },
    )) {
      yield new Tunnel(tunnel, this.api, this.binaryPath)
    }
  }

  async get(nameOrId: string): Promise<Tunnel> {
    if (isUuid(nameOrId)) {
      const cfTunnel = await this.api.get<CfTunnel>(
        this.api.accountPath(`/cfd_tunnel/${nameOrId}`),
      )
      return new Tunnel(cfTunnel, this.api, this.binaryPath)
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
