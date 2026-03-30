import { Effect, Layer, ServiceMap } from "effect"
import type { CfVirtualNetwork } from "../schemas.js"
import { TunnelApiError, TunnelAuthError, TunnelSdkError } from "../errors.js"
import { VNet } from "../schemas.js"
import { CloudflareApi } from "./CloudflareApi.js"

type ManagerErrors = TunnelApiError | TunnelAuthError | TunnelSdkError

export class VNetManager extends ServiceMap.Service<
  VNetManager,
  {
    create(
      name: string,
      options?: { default?: boolean; comment?: string },
    ): Effect.Effect<VNet, ManagerErrors>
    del(name: string): Effect.Effect<void, ManagerErrors>
    list(): Effect.Effect<ReadonlyArray<VNet>, ManagerErrors>
  }
>()("tunnels/VNetManager") {
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
