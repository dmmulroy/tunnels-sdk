import { Effect, Layer, ServiceMap } from "effect"
import type { CfVirtualNetwork } from "../schemas.js"
import { TunnelApiError, TunnelAuthError, TunnelSdkError } from "../errors.js"
import { VNet } from "../schemas.js"
import { CloudflareApi } from "./CloudflareApi.js"

type ManagerErrors = TunnelApiError | TunnelAuthError | TunnelSdkError

/**
 * Effect service for managing Cloudflare WARP virtual networks.
 */
export class VNetManager extends ServiceMap.Service<
  VNetManager,
  {
    /**
     * Creates a virtual network.
     */
    create(
      name: string,
      options?: { default?: boolean; comment?: string },
    ): Effect.Effect<VNet, ManagerErrors>
    /**
     * Deletes a virtual network by name.
     */
    del(name: string): Effect.Effect<void, ManagerErrors>
    /**
     * Lists virtual networks for the account.
     */
    list(): Effect.Effect<ReadonlyArray<VNet>, ManagerErrors>
  }
>()("tunnels/VNetManager") {
  /**
   * Live virtual-network manager layer backed by `CloudflareApi`.
   */
  static readonly layer = Layer.effect(
    VNetManager,
    Effect.gen(function* () {
      const api = yield* CloudflareApi

      const mapVNet = (network: CfVirtualNetwork): VNet =>
        new VNet({
          id: network.id,
          name: network.name,
          isDefault: network.is_default_network,
          comment: network.comment,
        })

      const create = Effect.fn("VNetManager.create")(function* (
        name: string,
        options?: { default?: boolean; comment?: string },
      ): Effect.fn.Return<VNet, ManagerErrors> {
        const body: Record<string, unknown> = { name }
        if (options?.default) body.is_default = true
        if (options?.comment) body.comment = options.comment

        const result = yield* api.post<CfVirtualNetwork>(
          api.accountPath("/teamnet/virtual_networks"),
          body,
        )
        return mapVNet(result)
      })

      const list = Effect.fn("VNetManager.list")(function* (): Effect.fn.Return<
        ReadonlyArray<VNet>,
        ManagerErrors
      > {
        const results = yield* api.get<CfVirtualNetwork[]>(
          api.accountPath("/teamnet/virtual_networks"),
        )
        return results.map(mapVNet)
      })

      const del = Effect.fn("VNetManager.del")(function* (
        name: string,
      ): Effect.fn.Return<void, ManagerErrors> {
        const vnets = yield* list()
        const match = vnets.find((v) => v.name === name)
        if (!match) {
          return yield* new TunnelSdkError({
            message: `Virtual network not found: "${name}"`,
          })
        }
        yield* api.del(api.accountPath(`/teamnet/virtual_networks/${match.id}`))
      })

      return VNetManager.of({ create, del, list })
    }),
  )
}
