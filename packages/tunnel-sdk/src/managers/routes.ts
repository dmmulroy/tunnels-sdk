import type { ApiClient } from "../api/client.js"
import type { CfRoute } from "../api/types.js"
import type { Route, RouteAddOptions, RouteCheckResult } from "../types.js"

/**
 * Manages private network routes for a tunnel.
 *
 * @example
 * ```ts
 * await tunnel.routes.add("172.16.0.0/16")
 * await tunnel.routes.add("10.0.0.0/8", { vnet: "production" })
 * const routes = await tunnel.routes.list()
 * ```
 */
export class RouteManager {
  constructor(
    private readonly api: ApiClient,
    private readonly tunnelId: string,
  ) {}

  /** Add a route */
  async add(network: string, options?: RouteAddOptions): Promise<void> {
    const body: Record<string, unknown> = {
      network,
      tunnel_id: this.tunnelId,
    }

    if (options?.comment) body.comment = options.comment
    if (options?.vnet) {
      body.virtual_network_id = await this.resolveVnetId(options.vnet)
    }

    await this.api.post(
      this.api.accountPath("/teamnet/routes"),
      body,
    )
  }

  /** Remove a route by network CIDR */
  async remove(network: string): Promise<void> {
    const routes = await this.list()
    const match = routes.find((r) => r.network === network)
    if (!match) {
      throw new Error(`No route found for network: "${network}"`)
    }

    await this.api.delete(
      this.api.accountPath(`/teamnet/routes/${encodeURIComponent(network)}`),
    )
  }

  /** List routes for this tunnel */
  async list(): Promise<Route[]> {
    const routes = await this.api.get<CfRoute[]>(
      this.api.accountPath("/teamnet/routes"),
      { tunnel_id: this.tunnelId, is_deleted: "false" },
    )

    return routes.map((r) => ({
      network: r.network,
      tunnelId: r.tunnel_id,
      tunnelName: r.tunnel_name,
      vnet: r.virtual_network_id ?? "default",
      comment: r.comment,
    }))
  }

  /** Check which tunnel/route handles a specific IP */
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
    } catch {
      return null
    }
  }

  /** Resolve a virtual network name to its ID */
  private async resolveVnetId(name: string): Promise<string> {
    const vnets = await this.api.get<Array<{ id: string; name: string }>>(
      this.api.accountPath("/teamnet/virtual_networks"),
      { name },
    )

    const match = vnets.find((v) => v.name === name)
    if (!match) {
      throw new Error(`Virtual network not found: "${name}"`)
    }

    return match.id
  }
}
