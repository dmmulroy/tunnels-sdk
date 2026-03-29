import type { ApiClient } from "../api/client.js"
import type { CfDnsRecord, CfZone } from "../api/types.js"
import type { DnsEnsureOptions, DnsRecord } from "../types.js"

export class DnsManager {
  private readonly zoneIdCache = new Map<string, string>()

  constructor(
    private readonly api: ApiClient,
    private readonly tunnelId: string,
  ) {}

  private get cnameTarget(): string {
    return `${this.tunnelId}.cfargotunnel.com`
  }

  async ensure(hostname: string, options?: DnsEnsureOptions): Promise<void> {
    const zoneId = await this.findZoneId(hostname)
    const existing = await this.findRecord(zoneId, hostname)

    if (existing) {
      if (existing.content === this.cnameTarget) return

      await this.api.put(
        this.api.zonePath(zoneId, `/dns_records/${existing.id}`),
        {
          type: "CNAME",
          name: hostname,
          content: this.cnameTarget,
          proxied: options?.proxied ?? true,
          ttl: options?.ttl ?? 1,
        },
      )
      return
    }

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

  async remove(hostname: string): Promise<void> {
    const zoneId = await this.findZoneId(hostname)
    const existing = await this.findRecord(zoneId, hostname)
    if (!existing) return

    await this.api.delete(this.api.zonePath(zoneId, `/dns_records/${existing.id}`))
  }

  async list(): Promise<DnsRecord[]> {
    const records: DnsRecord[] = []

    for await (const zone of this.api.paginate<CfZone>("/zones")) {
      const dnsRecords = await this.api.get<CfDnsRecord[]>(
        this.api.zonePath(zone.id, "/dns_records"),
        { type: "CNAME", content: this.cnameTarget },
      )

      for (const record of dnsRecords) {
        records.push({
          hostname: record.name,
          type: record.type,
          content: record.content,
        })
      }
    }

    return records
  }

  private async findZoneId(hostname: string): Promise<string> {
    const parts = hostname.split(".")
    for (let index = 0; index < parts.length - 1; index++) {
      const zoneName = parts.slice(index).join(".")

      const cached = this.zoneIdCache.get(zoneName)
      if (cached) return cached

      const zones = await this.api.get<CfZone[]>("/zones", { name: zoneName })
      if (zones.length > 0) {
        this.zoneIdCache.set(zoneName, zones[0].id)
        return zones[0].id
      }
    }

    throw new Error(`Could not find Cloudflare zone for hostname: "${hostname}"`)
  }

  private async findRecord(zoneId: string, hostname: string): Promise<CfDnsRecord | null> {
    const records = await this.api.get<CfDnsRecord[]>(
      this.api.zonePath(zoneId, "/dns_records"),
      { type: "CNAME", name: hostname },
    )
    return records[0] ?? null
  }
}
