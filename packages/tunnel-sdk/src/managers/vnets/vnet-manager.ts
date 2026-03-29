import type { IApiClient } from "../../api/interfaces.js"
import type { CfVirtualNetwork } from "../../api/types.js"

export interface VNet {
  id: string
  name: string
  isDefault: boolean
  comment?: string
}

export interface VNetCreateOptions {
  default?: boolean
  comment?: string
}

export class VNetManager {
  constructor(private readonly api: IApiClient) {}

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

  async delete(name: string): Promise<void> {
    const vnets = await this.list()
    const match = vnets.find((vnet) => vnet.name === name)
    if (!match) {
      throw new Error(`Virtual network not found: "${name}"`)
    }

    await this.api.delete(this.api.accountPath(`/teamnet/virtual_networks/${match.id}`))
  }

  async list(): Promise<VNet[]> {
    const results = await this.api.get<CfVirtualNetwork[]>(
      this.api.accountPath("/teamnet/virtual_networks"),
    )

    return results.map(mapVNet)
  }
}

function mapVNet(network: CfVirtualNetwork): VNet {
  return {
    id: network.id,
    name: network.name,
    isDefault: network.is_default_network,
    comment: network.comment,
  }
}
