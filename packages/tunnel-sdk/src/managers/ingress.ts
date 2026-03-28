import type { ApiClient } from "../api/client.js"
import type { CfTunnelConfig, CfIngressRule } from "../api/types.js"
import type { IngressRule, OriginRequestConfig } from "../types.js"

/**
 * Manages ingress rules for a tunnel.
 *
 * @example
 * ```ts
 * await tunnel.ingress.add({ hostname: "app.example.com", service: "http://localhost:3000" })
 * await tunnel.ingress.remove("old.example.com")
 * const rules = await tunnel.ingress.list()
 * ```
 */
export class IngressManager {
  constructor(
    private readonly api: ApiClient,
    private readonly tunnelId: string,
  ) {}

  /** List all ingress rules */
  async list(): Promise<IngressRule[]> {
    const config = await this.api.get<CfTunnelConfig>(
      this.api.accountPath(`/cfd_tunnel/${this.tunnelId}/configurations`),
    )
    return (config.config.ingress ?? []).map(mapIngressRule)
  }

  /** Add a new ingress rule (before the catch-all) */
  async add(rule: IngressRule): Promise<void> {
    const current = await this.list()

    // Check for duplicate hostname
    if (rule.hostname) {
      const existing = current.find((r) => r.hostname === rule.hostname)
      if (existing) {
        throw new Error(`Duplicate hostname: "${rule.hostname}" already exists in ingress rules`)
      }
    }

    // Insert before catch-all (last rule if it has no hostname)
    const catchAll = current.length > 0 && !current[current.length - 1].hostname
      ? current.pop()
      : undefined

    current.push(rule)
    if (catchAll) current.push(catchAll)

    await this.set(current)
  }

  /** Remove an ingress rule by hostname */
  async remove(hostname: string): Promise<void> {
    const current = await this.list()
    const filtered = current.filter((r) => r.hostname !== hostname)

    if (filtered.length === current.length) {
      throw new Error(`No ingress rule found with hostname: "${hostname}"`)
    }

    await this.set(filtered)
  }

  /** Replace all ingress rules. Auto-appends catch-all if missing. */
  async set(rules: IngressRule[]): Promise<void> {
    const normalized = [...rules]

    // Auto-append catch-all if missing
    const lastRule = normalized[normalized.length - 1]
    if (!lastRule || lastRule.hostname) {
      normalized.push({ service: "http_status:404" })
    }

    await this.api.put(
      this.api.accountPath(`/cfd_tunnel/${this.tunnelId}/configurations`),
      {
        config: {
          ingress: normalized.map(toCfIngressRule),
        },
      },
    )
  }
}

function mapIngressRule(rule: CfIngressRule): IngressRule {
  return {
    hostname: rule.hostname,
    service: rule.service,
    path: rule.path,
    originRequest: rule.originRequest as OriginRequestConfig | undefined,
  }
}

function toCfIngressRule(rule: IngressRule): CfIngressRule {
  const result: CfIngressRule = { service: rule.service }
  if (rule.hostname) result.hostname = rule.hostname
  if (rule.path) result.path = rule.path
  if (rule.originRequest) result.originRequest = rule.originRequest as Record<string, unknown>
  return result
}
