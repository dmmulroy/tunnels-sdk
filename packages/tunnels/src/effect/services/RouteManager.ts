import { Effect, Layer, ServiceMap } from "effect"
import type { CfRoute } from "../schemas.js"
import { TunnelApiError, TunnelAuthError, TunnelSdkError } from "../errors.js"
import { Route, RouteCheckResult } from "../schemas.js"
import { CloudflareApi } from "./CloudflareApi.js"

type ManagerErrors = TunnelApiError | TunnelAuthError | TunnelSdkError

/**
 * Effect service for managing private-network routes for tunnels.
 */
export class RouteManager extends ServiceMap.Service<
  RouteManager,
  {
    /**
     * Adds a private-network route to a tunnel.
     */
    add(
      tunnelId: string,
      network: string,
      options?: { vnet?: string; comment?: string },
    ): Effect.Effect<void, ManagerErrors>
    /**
     * Removes a private-network route from a tunnel.
     */
    remove(tunnelId: string, network: string): Effect.Effect<void, ManagerErrors>
    /**
     * Lists private-network routes for a tunnel.
     */
    list(tunnelId: string): Effect.Effect<ReadonlyArray<Route>, ManagerErrors>
    /**
     * Checks which private-network route would receive an IP address.
     */
    check(
      ip: string,
    ): Effect.Effect<RouteCheckResult | null, TunnelApiError | TunnelAuthError>
  }
>()("tunnels/RouteManager") {
  /**
   * Live route manager layer backed by `CloudflareApi`.
   */
  static readonly layer = Layer.effect(
    RouteManager,
    Effect.gen(function* () {
      const api = yield* CloudflareApi

      const resolveVnetId = Effect.fn("RouteManager.resolveVnetId")(function* (
        name: string,
      ): Effect.fn.Return<string, ManagerErrors> {
        const vnets = yield* api.get<Array<{ id: string; name: string }>>(
          api.accountPath("/teamnet/virtual_networks"),
          { name },
        )
        const match = vnets.find((v) => v.name === name)
        if (!match) {
          return yield* new TunnelSdkError({
            message: `Virtual network not found: "${name}"`,
          })
        }
        return match.id
      })

      const list = Effect.fn("RouteManager.list")(function* (
        tunnelId: string,
      ): Effect.fn.Return<ReadonlyArray<Route>, ManagerErrors> {
        const routes = yield* api.get<CfRoute[]>(
          api.accountPath("/teamnet/routes"),
          { tunnel_id: tunnelId, is_deleted: "false" },
        )
        return routes.map(
          (route) =>
            new Route({
              network: route.network,
              tunnelId: route.tunnel_id,
              tunnelName: route.tunnel_name,
              vnet: route.virtual_network_id ?? "default",
              comment: route.comment,
            }),
        )
      })

      const add = Effect.fn("RouteManager.add")(function* (
        tunnelId: string,
        network: string,
        options?: { vnet?: string; comment?: string },
      ): Effect.fn.Return<void, ManagerErrors> {
        const body: Record<string, unknown> = {
          network,
          tunnel_id: tunnelId,
        }
        if (options?.comment) body.comment = options.comment
        if (options?.vnet) {
          body.virtual_network_id = yield* resolveVnetId(options.vnet)
        }
        yield* api.post(api.accountPath("/teamnet/routes"), body)
      })

      const remove = Effect.fn("RouteManager.remove")(function* (
        tunnelId: string,
        network: string,
      ): Effect.fn.Return<void, ManagerErrors> {
        const routes = yield* list(tunnelId)
        const match = routes.find((r) => r.network === network)
        if (!match) {
          return yield* new TunnelSdkError({
            message: `No route found for network: "${network}"`,
          })
        }
        yield* api.del(
          api.accountPath(`/teamnet/routes/${encodeURIComponent(network)}`),
        )
      })

      const check = Effect.fn("RouteManager.check")(function* (
        ip: string,
      ): Effect.fn.Return<RouteCheckResult | null, TunnelApiError | TunnelAuthError> {
        const result = yield* api
          .get<{
            tunnel_id: string
            tunnel_name: string
            network: string
            virtual_network_id: string
          }>(api.accountPath(`/teamnet/routes/ip/${encodeURIComponent(ip)}`))
          .pipe(
            Effect.map(
              (r) =>
                new RouteCheckResult({
                  tunnel: r.tunnel_name || r.tunnel_id,
                  route: r.network,
                  vnet: r.virtual_network_id ?? "default",
                }),
            ),
            Effect.catchTag("TunnelApiError", (e) =>
              e.status === 404 ? Effect.succeed(null) : Effect.fail(e),
            ),
          )
        return result
      })

      return RouteManager.of({ add, remove, list, check })
    }),
  )
}
