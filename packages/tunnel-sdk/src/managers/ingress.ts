import type { ApiClient } from "../api/client.js"
import type { CfIngressRule, CfTunnelConfig } from "../api/types.js"
import type { IngressRule, OriginRequestConfig } from "../types.js"

export class IngressManager {
  constructor(
    private readonly api: ApiClient,
    private readonly tunnelId: string,
  ) {}

  async list(): Promise<IngressRule[]> {
    const config = await this.api.get<CfTunnelConfig>(
      this.api.accountPath(`/cfd_tunnel/${this.tunnelId}/configurations`),
    )
    return (config.config.ingress ?? []).map(mapIngressRule)
  }

  async add(rule: IngressRule): Promise<void> {
    const current = await this.list()

    if (rule.hostname && current.some((existing) => existing.hostname === rule.hostname)) {
      throw new Error(`Duplicate hostname: "${rule.hostname}" already exists in ingress rules`)
    }

    const catchAll = current.length > 0 && !current[current.length - 1].hostname
      ? current.pop()
      : undefined

    current.push(rule)
    if (catchAll) current.push(catchAll)

    await this.set(current)
  }

  async remove(hostname: string): Promise<void> {
    const current = await this.list()
    const filtered = current.filter((rule) => rule.hostname !== hostname)

    if (filtered.length === current.length) {
      throw new Error(`No ingress rule found with hostname: "${hostname}"`)
    }

    await this.set(filtered)
  }

  async set(rules: IngressRule[]): Promise<void> {
    const normalized = [...rules]
    const lastRule = normalized[normalized.length - 1]

    if (!lastRule || lastRule.hostname) {
      normalized.push({ service: "http_status:404" })
    }

    // Read the current config so we preserve warp-routing, originRequest, etc.
    // The PUT endpoint replaces the entire config object.
    const current = await this.api.get<CfTunnelConfig>(
      this.api.accountPath(`/cfd_tunnel/${this.tunnelId}/configurations`),
    )

    await this.api.put(
      this.api.accountPath(`/cfd_tunnel/${this.tunnelId}/configurations`),
      {
        config: {
          ...current.config,
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
