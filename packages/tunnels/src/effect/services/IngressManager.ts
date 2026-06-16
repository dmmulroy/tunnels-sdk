import { Effect, Layer, ServiceMap } from "effect"
import { CfIngressRule, type CfTunnelConfig } from "../schemas.js"
import { TunnelApiError, TunnelAuthError, TunnelSdkError } from "../errors.js"
import { IngressRule } from "../schemas.js"
import { CloudflareApi } from "./CloudflareApi.js"

type ManagerErrors = TunnelApiError | TunnelAuthError | TunnelSdkError

const mapIngressRule = (rule: CfIngressRule): IngressRule =>
  new IngressRule({
    hostname: rule.hostname,
    service: rule.service,
    path: rule.path,
    originRequest: rule.originRequest as Record<string, unknown> | undefined,
  })

const toCfIngressRule = (rule: IngressRule): CfIngressRule =>
  new CfIngressRule({
    service: rule.service,
    ...(rule.hostname ? { hostname: rule.hostname } : {}),
    ...(rule.path ? { path: rule.path } : {}),
    ...(rule.originRequest ? { originRequest: rule.originRequest as Record<string, unknown> } : {}),
  })

/**
 * Effect service for reading and mutating tunnel ingress rules.
 */
export class IngressManager extends ServiceMap.Service<
  IngressManager,
  {
    /**
     * Lists ingress rules for a tunnel.
     */
    list(tunnelId: string): Effect.Effect<ReadonlyArray<IngressRule>, ManagerErrors>
    /**
     * Adds an ingress rule before the catch-all rule.
     */
    add(tunnelId: string, rule: IngressRule): Effect.Effect<void, ManagerErrors>
    /**
     * Removes an ingress rule by hostname.
     */
    remove(tunnelId: string, hostname: string): Effect.Effect<void, ManagerErrors>
    /**
     * Replaces all ingress rules for a tunnel.
     */
    set(tunnelId: string, rules: ReadonlyArray<IngressRule>): Effect.Effect<void, ManagerErrors>
  }
>()("tunnels/IngressManager") {
  /**
   * Live ingress manager layer backed by `CloudflareApi`.
   */
  static readonly layer = Layer.effect(
    IngressManager,
    Effect.gen(function* () {
      const api = yield* CloudflareApi

      const list = Effect.fn("IngressManager.list")(function* (
        tunnelId: string,
      ): Effect.fn.Return<ReadonlyArray<IngressRule>, ManagerErrors> {
        const config = yield* api.get<CfTunnelConfig>(
          api.accountPath(`/cfd_tunnel/${tunnelId}/configurations`),
        )
        return (config.config.ingress ?? []).map(mapIngressRule)
      })

      const set = Effect.fn("IngressManager.set")(function* (
        tunnelId: string,
        rules: ReadonlyArray<IngressRule>,
      ): Effect.fn.Return<void, ManagerErrors> {
        const normalized = [...rules]
        const lastRule = normalized[normalized.length - 1]

        if (!lastRule || lastRule.hostname) {
          normalized.push(new IngressRule({ service: "http_status:404" }))
        }

        // Read current config to preserve warp-routing, originRequest, etc.
        const current = yield* api.get<CfTunnelConfig>(
          api.accountPath(`/cfd_tunnel/${tunnelId}/configurations`),
        )

        yield* api.put(
          api.accountPath(`/cfd_tunnel/${tunnelId}/configurations`),
          {
            config: {
              ...current.config,
              ingress: normalized.map(toCfIngressRule),
            },
          },
        )
      })

      const add = Effect.fn("IngressManager.add")(function* (
        tunnelId: string,
        rule: IngressRule,
      ): Effect.fn.Return<void, ManagerErrors> {
        const current = yield* list(tunnelId)
        const mutable = [...current]

        if (rule.hostname && mutable.some((existing) => existing.hostname === rule.hostname)) {
          return yield* new TunnelSdkError({
            message: `Duplicate hostname: "${rule.hostname}" already exists in ingress rules`,
          })
        }

        // Insert before catch-all
        const catchAll =
          mutable.length > 0 && !mutable[mutable.length - 1].hostname
            ? mutable.pop()
            : undefined

        mutable.push(rule)
        if (catchAll) mutable.push(catchAll)

        yield* set(tunnelId, mutable)
      })

      const remove = Effect.fn("IngressManager.remove")(function* (
        tunnelId: string,
        hostname: string,
      ): Effect.fn.Return<void, ManagerErrors> {
        const current = yield* list(tunnelId)
        const filtered = current.filter((rule) => rule.hostname !== hostname)

        if (filtered.length === current.length) {
          return yield* new TunnelSdkError({
            message: `No ingress rule found with hostname: "${hostname}"`,
          })
        }

        yield* set(tunnelId, filtered)
      })

      return IngressManager.of({ list, add, remove, set })
    }),
  )
}
