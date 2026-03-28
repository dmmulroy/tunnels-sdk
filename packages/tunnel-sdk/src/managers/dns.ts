import type { ApiClient } from "../api/client.js"
import type { CfDnsRecord, CfZone } from "../api/types.js"
import type { DnsEnsureOptions, DnsRecord } from "../types.js"

/**
 * Manages DNS CNAME records for a tunnel.
 *
 * @example
 * ```ts
 * await tunnel.dns.ensure("app.example.com")
 * await tunnel.dns.remove("old.example.com")
 * const records = await tunnel.dns.list()
 * ```
 */
export class DnsManager {
  constructor(
    private readonly api: ApiClient,
    private readonly tunnelId: string,
  ) {}

  /** Tunnel CNAME target (e.g., "c1744f8b.cfargotunnel.com") */
  private get cnameTarget(): string {
    return `${this.tunnelId}.cfargotunnel.com`
  }

  /**
   * Ensure a CNAME record exists pointing to this tunnel.
   * Idempotent — creates if missing, no-ops if exists and correct.
   */
  async ensure(hostname: string, options?: DnsEnsureOptions): Promise<void> {
    const zoneId = await this.findZoneId(hostname)
    const existing = await this.findRecord(zoneId, hostname)

    if (existing) {
      // Already exists and points to this tunnel — no-op
      if (existing.content === this.cnameTarget) return

      // Points to wrong target — update it
      await this.api.put(
        this.api.zonePath(zoneId, `/dns_records/${existing.id}`),
        {
          type: "CNAME",
          name: hostname,
          content: this.cnameTarget,
          proxied: options?.proxied ?? true,
          ttl: options?.ttl ?? 1, // 1 = auto
        },
      )
      return
    }

    // Create new record
    await this.api.post(
      this.api.zonePath(zoneId, "/dns_records"),
      {
        type: "CNAME",
        name: hostname,
        content: this.cnameTarget,
        proxied: options?.proxied ?? true,
        ttl: options?.ttl ?? 1,
      },
    )
  }

  /** Remove a DNS record pointing to this tunnel */
  async remove(hostname: string): Promise<void> {
    const zoneId = await this.findZoneId(hostname)
    const existing = await this.findRecord(zoneId, hostname)

    if (!existing) return // Already gone — idempotent

    await this.api.delete(
      this.api.zonePath(zoneId, `/dns_records/${existing.id}`),
    )
  }

  /** List all DNS records pointing to this tunnel */
  async list(): Promise<DnsRecord[]> {
    // This requires knowing which zones to search — we search for CNAME records
    // pointing to our tunnel's cfargotunnel.com target.
    // For now, we search across zones the account has access to.
    const zones = await this.api.get<CfZone[]>("/zones", { per_page: "50" })
    const records: DnsRecord[] = []

    for (const zone of zones) {
      const dnsRecords = await this.api.get<CfDnsRecord[]>(
        this.api.zonePath(zone.id, "/dns_records"),
        { type: "CNAME", content: this.cnameTarget },
      )

      for (const r of dnsRecords) {
        records.push({
          hostname: r.name,
          type: r.type,
          content: r.content,
        })
      }
    }

    return records
  }

  /** Find the zone ID for a hostname (e.g., "app.example.com" → zone ID for "example.com") */
  private async findZoneId(hostname: string): Promise<string> {
    // Try progressively shorter suffixes: app.example.com → example.com
    const parts = hostname.split(".")
    for (let i = 0; i < parts.length - 1; i++) {
      const zoneName = parts.slice(i).join(".")
      const zones = await this.api.get<CfZone[]>("/zones", { name: zoneName })
      if (zones.length > 0) return zones[0].id
    }

    throw new Error(`Could not find Cloudflare zone for hostname: "${hostname}"`)
  }

  /** Find an existing DNS record by hostname in a zone */
  private async findRecord(zoneId: string, hostname: string): Promise<CfDnsRecord | null> {
    const records = await this.api.get<CfDnsRecord[]>(
      this.api.zonePath(zoneId, "/dns_records"),
      { type: "CNAME", name: hostname },
    )
    return records.length > 0 ? records[0] : null
  }
}
