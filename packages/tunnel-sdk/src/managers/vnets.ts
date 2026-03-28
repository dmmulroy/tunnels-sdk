import type { ApiClient } from "../api/client.js"
import type { CfVirtualNetwork } from "../api/types.js"
import type { VNet, VNetCreateOptions } from "../types.js"

/**
 * Manages virtual networks for Zero Trust routing.
 *
 * @example
 * ```ts
 * await client.vnets.create("production")
 * await client.vnets.create("staging", { default: true })
 * const vnets = await client.vnets.list()
 * ```
 */
export class VNetManager {
  constructor(private readonly api: ApiClient) {}

  /** Create a virtual network */
  async create(name: string, options?: VNetCreateOptions): Promise<VNet> {
    const body: Record<string, unknown> = { name }
    if (options?.default) body.is_default = true
    if (options?.comment) body.comment = options.comment

    const result = await this.api.post<CfVirtualNetwork>(
      this.api.accountPath("/teamnet/virtual_networks"),
      body,
    )

    return mapVNet(result)
  }

  /** Delete a virtual network by name */
  async delete(name: string): Promise<void> {
    const vnets = await this.list()
    const match = vnets.find((v) => v.name === name)
    if (!match) {
      throw new Error(`Virtual network not found: "${name}"`)
    }

    await this.api.delete(
      this.api.accountPath(`/teamnet/virtual_networks/${match.id}`),
    )
  }

  /** List all virtual networks */
  async list(): Promise<VNet[]> {
    const results = await this.api.get<CfVirtualNetwork[]>(
      this.api.accountPath("/teamnet/virtual_networks"),
    )

    return results.map(mapVNet)
  }
}

function mapVNet(v: CfVirtualNetwork): VNet {
  return {
    id: v.id,
    name: v.name,
    isDefault: v.is_default_network,
    comment: v.comment,
  }
}
