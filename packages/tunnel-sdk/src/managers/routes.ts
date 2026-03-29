import type { ApiClient } from "../api/client.js"
import type { CfRoute } from "../api/types.js"
import { TunnelApiError } from "../errors.js"
import type { Route, RouteAddOptions, RouteCheckResult } from "../types.js"

export class RouteManager {
  constructor(
    private readonly api: ApiClient,
    private readonly tunnelId: string,
  ) {}

  async add(network: string, options?: RouteAddOptions): Promise<void> {
    const body: Record<string, unknown> = {
      network,
      tunnel_id: this.tunnelId,
    }

    if (options?.comment) body.comment = options.comment
    if (options?.vnet) {
      body.virtual_network_id = await this.resolveVnetId(options.vnet)
    }

    await this.api.post(this.api.accountPath("/teamnet/routes"), body)
  }

  async remove(network: string): Promise<void> {
    const routes = await this.list()
    const match = routes.find((route) => route.network === network)
    if (!match) {
      throw new Error(`No route found for network: "${network}"`)
    }

    await this.api.delete(this.api.accountPath(`/teamnet/routes/${encodeURIComponent(network)}`))
  }

  async list(): Promise<Route[]> {
    const routes = await this.api.get<CfRoute[]>(
      this.api.accountPath("/teamnet/routes"),
      { tunnel_id: this.tunnelId, is_deleted: "false" },
    )

    return routes.map((route) => ({
      network: route.network,
      tunnelId: route.tunnel_id,
      tunnelName: route.tunnel_name,
      vnet: route.virtual_network_id ?? "default",
      comment: route.comment,
    }))
  }

  async check(ip: string): Promise<RouteCheckResult | null> {
    try {
      const result = await this.api.get<{
        tunnel_id: string
        tunnel_name: string
        network: string
        virtual_network_id: string
      }>(
        this.api.accountPath(`/teamnet/routes/ip/${encodeURIComponent(ip)}`),
      )

      return {
        tunnel: result.tunnel_name || result.tunnel_id,
        route: result.network,
        vnet: result.virtual_network_id ?? "default",
      }
    } catch (error) {
      if (error instanceof TunnelApiError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  private async resolveVnetId(name: string): Promise<string> {
    const vnets = await this.api.get<Array<{ id: string; name: string }>>(
      this.api.accountPath("/teamnet/virtual_networks"),
      { name },
    )

    const match = vnets.find((vnet) => vnet.name === name)
    if (!match) {
      throw new Error(`Virtual network not found: "${name}"`)
    }

    return match.id
  }
}
