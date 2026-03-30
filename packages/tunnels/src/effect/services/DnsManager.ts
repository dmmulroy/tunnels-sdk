import { Effect, Layer, ServiceMap, Stream } from "effect"
import type { CfDnsRecord, CfZone } from "../schemas.js"
import { TunnelApiError, TunnelAuthError, TunnelSdkError } from "../errors.js"
import { DnsRecord } from "../schemas.js"
import { CloudflareApi } from "./CloudflareApi.js"

type ManagerErrors = TunnelApiError | TunnelAuthError | TunnelSdkError

export class DnsManager extends ServiceMap.Service<
  DnsManager,
  {
    ensure(
      tunnelId: string,
      hostname: string,
      options?: { proxied?: boolean; ttl?: number },
    ): Effect.Effect<void, ManagerErrors>
    remove(tunnelId: string, hostname: string): Effect.Effect<void, ManagerErrors>
    list(tunnelId: string): Effect.Effect<ReadonlyArray<DnsRecord>, ManagerErrors>
  }
>()("tunnels/DnsManager") {
  static readonly layer = Layer.effect(
    DnsManager,
    Effect.gen(function* () {
      const api = yield* CloudflareApi
      const zoneIdCache = new Map<string, string>()

      const cnameTarget = (tunnelId: string) => `${tunnelId}.cfargotunnel.com`

      const findZoneId = Effect.fn("DnsManager.findZoneId")(function* (
        hostname: string,
      ): Effect.fn.Return<string, ManagerErrors> {
        const parts = hostname.split(".")
        for (let i = 0; i < parts.length - 1; i++) {
          const zoneName = parts.slice(i).join(".")

          const cached = zoneIdCache.get(zoneName)
          if (cached) return cached

          const zones = yield* api.get<CfZone[]>("/zones", { name: zoneName })
          if (zones.length > 0) {
            zoneIdCache.set(zoneName, zones[0].id)
            return zones[0].id
          }
        }
        return yield* new TunnelSdkError({
          message: `Could not find Cloudflare zone for hostname: "${hostname}"`,
        })
      })

      const findRecord = Effect.fn("DnsManager.findRecord")(function* (
        zoneId: string,
        hostname: string,
      ): Effect.fn.Return<CfDnsRecord | null, TunnelApiError | TunnelAuthError> {
        const records = yield* api.get<CfDnsRecord[]>(
          api.zonePath(zoneId, "/dns_records"),
          { type: "CNAME", name: hostname },
        )
        return records[0] ?? null
      })

      const ensure = Effect.fn("DnsManager.ensure")(function* (
        tunnelId: string,
        hostname: string,
        options?: { proxied?: boolean; ttl?: number },
      ): Effect.fn.Return<void, ManagerErrors> {
        const zoneId = yield* findZoneId(hostname)
        const target = cnameTarget(tunnelId)
        const existing = yield* findRecord(zoneId, hostname)

        if (existing) {
          if (existing.content === target) return
          yield* api.put(api.zonePath(zoneId, `/dns_records/${existing.id}`), {
            type: "CNAME",
            name: hostname,
            content: target,
            proxied: options?.proxied ?? true,
            ttl: options?.ttl ?? 1,
          })
          return
        }

        yield* api.post(api.zonePath(zoneId, "/dns_records"), {
          type: "CNAME",
          name: hostname,
          content: target,
          proxied: options?.proxied ?? true,
          ttl: options?.ttl ?? 1,
        })
      })

      const remove = Effect.fn("DnsManager.remove")(function* (
        tunnelId: string,
        hostname: string,
      ): Effect.fn.Return<void, ManagerErrors> {
        const zoneId = yield* findZoneId(hostname)
        const existing = yield* findRecord(zoneId, hostname)
        if (!existing) return
        yield* api.del(api.zonePath(zoneId, `/dns_records/${existing.id}`))
      })

      const list = Effect.fn("DnsManager.list")(function* (
        tunnelId: string,
      ): Effect.fn.Return<ReadonlyArray<DnsRecord>, ManagerErrors> {
        const target = cnameTarget(tunnelId)
        const records: DnsRecord[] = []

        // Get all zones via pagination
        const zones = yield* api
          .paginate<CfZone>("/zones")
          .pipe(Stream.runCollect)

        for (const zone of zones) {
          const dnsRecords = yield* api.get<CfDnsRecord[]>(
            api.zonePath(zone.id, "/dns_records"),
            { type: "CNAME", content: target },
          )
          for (const record of dnsRecords) {
            records.push(
              new DnsRecord({
                hostname: record.name,
                type: record.type,
                content: record.content,
              }),
            )
          }
        }

        return records
      })

      return DnsManager.of({ ensure, remove, list })
    }),
  )
}
