import { Effect, Layer, ServiceMap, Stream } from "effect";
import type { CfDnsRecord, CfZone } from "../schemas.js";
import { TunnelApiError, TunnelAuthError, TunnelSdkError } from "../errors.js";
import { DnsRecord } from "../schemas.js";
import { CloudflareApi } from "./CloudflareApi.js";

type ManagerErrors = TunnelApiError | TunnelAuthError | TunnelSdkError;
type ManagedCfDnsRecord = CfDnsRecord & { comment?: string; tags?: ReadonlyArray<string> };

/**
 * Effect service for managing DNS records that point to tunnels.
 */
export class DnsManager extends ServiceMap.Service<
  DnsManager,
  {
    /**
     * Creates or updates a CNAME record for a tunnel hostname.
     */
    ensure(
      tunnelId: string,
      hostname: string,
      options?: { proxied?: boolean; ttl?: number; overwrite?: boolean; cleanup?: boolean; },
    ): Effect.Effect<void, ManagerErrors>;
    /**
     * Removes a CNAME record for a hostname.
     */
    remove(hostname: string): Effect.Effect<void, ManagerErrors>;
    /**
     * Removes SDK-owned DNS records for a tunnel that are marked for cleanup.
     */
    removeManaged(tunnelId: string): Effect.Effect<void, ManagerErrors>;
    /**
     * Lists DNS records that point to a tunnel.
     */
    list(tunnelId: string): Effect.Effect<ReadonlyArray<DnsRecord>, ManagerErrors>;
  }
>()("tunnels/DnsManager") {
  /**
   * Live DNS manager layer backed by `CloudflareApi`.
   */
  static readonly layer = Layer.effect(
    DnsManager,
    Effect.gen(function* () {
      const api = yield* CloudflareApi;
      const zoneIdCache = new Map<string, string>();

      const cnameTarget = (tunnelId: string) => `${tunnelId}.cfargotunnel.com`;
      const managedComment = (tunnelId: string, cleanup: boolean) =>
        `Managed by tunnels-sdk; tunnel=${tunnelId}; cleanup=${cleanup ? "true" : "false"}`;
      const managedTags = (tunnelId: string, cleanup: boolean) => [
        "tunnels-sdk:managed",
        `tunnels-sdk:tunnel:${tunnelId}`,
        `tunnels-sdk:cleanup:${cleanup ? "true" : "false"}`,
      ];
      const isManagedForTunnel = (record: ManagedCfDnsRecord, tunnelId: string) =>
        (record.comment?.includes("Managed by tunnels-sdk") === true &&
          record.comment.includes(`tunnel=${tunnelId}`)) ||
        (record.tags?.includes("tunnels-sdk:managed") === true &&
          record.tags.includes(`tunnels-sdk:tunnel:${tunnelId}`));
      const allowsCleanup = (record: ManagedCfDnsRecord) =>
        record.comment?.includes("cleanup=false") !== true &&
        record.tags?.includes("tunnels-sdk:cleanup:false") !== true;
      const recordBody = (
        tunnelId: string,
        hostname: string,
        target: string,
        options?: { proxied?: boolean; ttl?: number; cleanup?: boolean },
      ) => {
        const cleanup = options?.cleanup ?? true;
        return {
          type: "CNAME",
          name: hostname,
          content: target,
          proxied: options?.proxied ?? true,
          ttl: options?.ttl ?? 1,
          comment: managedComment(tunnelId, cleanup),
          tags: managedTags(tunnelId, cleanup),
        };
      };

      const findZoneId = Effect.fn("DnsManager.findZoneId")(function* (
        hostname: string,
      ): Effect.fn.Return<string, ManagerErrors> {
        const parts = hostname.split(".");
        for (let i = 0; i < parts.length - 1; i++) {
          const zoneName = parts.slice(i).join(".");

          const cached = zoneIdCache.get(zoneName);
          if (cached) return cached;

          const zones = yield* api.get<CfZone[]>("/zones", { name: zoneName });
          if (zones.length > 0) {
            zoneIdCache.set(zoneName, zones[0].id);
            return zones[0].id;
          }
        }
        return yield* new TunnelSdkError({
          message: `could not find a Cloudflare zone for "${hostname}"\nhelp: add the parent domain to this account, or use a hostname under an existing zone`,
        });
      });

      const findRecord = Effect.fn("DnsManager.findRecord")(function* (
        zoneId: string,
        hostname: string,
        type?: string,
      ): Effect.fn.Return<CfDnsRecord | null, TunnelApiError | TunnelAuthError> {
        const records = yield* api.get<CfDnsRecord[]>(
          api.zonePath(zoneId, "/dns_records"),
          type ? { type, name: hostname } : { name: hostname },
        );
        return records[0] ?? null;
      });

      const ensure = Effect.fn("DnsManager.ensure")(function* (
        tunnelId: string,
        hostname: string,
        options?: { proxied?: boolean; ttl?: number; overwrite?: boolean; cleanup?: boolean; },
      ): Effect.fn.Return<void, ManagerErrors> {
        const zoneId = yield* findZoneId(hostname);
        const target = cnameTarget(tunnelId);
        const existing = yield* findRecord(zoneId, hostname);

        if (existing) {
          if (existing.type === "CNAME" && existing.content === target) return;
          if (!options?.overwrite) {
            return yield* new TunnelSdkError({
              message: `DNS record "${hostname}" already exists and does not point to this tunnel\nhelp: pass dns: { overwrite: true } to replace it`,
            });
          }
          yield* api.put(
            api.zonePath(zoneId, `/dns_records/${existing.id}`),
            recordBody(tunnelId, hostname, target, options),
          );
          return;
        }

        yield* api.post(
          api.zonePath(zoneId, "/dns_records"),
          recordBody(tunnelId, hostname, target, options),
        );
      });

      const remove = Effect.fn("DnsManager.remove")(function* (
        hostname: string,
      ): Effect.fn.Return<void, ManagerErrors> {
        const zoneId = yield* findZoneId(hostname);
        const existing = yield* findRecord(zoneId, hostname, "CNAME");
        if (!existing) return;
        yield* api.del(api.zonePath(zoneId, `/dns_records/${existing.id}`));
      });

      const listRecordsByZone = (tunnelId: string) => Effect.gen(function* () {
        const target = cnameTarget(tunnelId);
        const zones = yield* api
          .paginate<CfZone>("/zones")
          .pipe(Stream.runCollect);

        return yield* Effect.forEach(
          zones,
          (zone) =>
            api
              .get<ManagedCfDnsRecord[]>(api.zonePath(zone.id, "/dns_records"), {
                type: "CNAME",
                content: target,
              })
              .pipe(
                Effect.map((dnsRecords) => ({ zoneId: zone.id, records: dnsRecords })),
              ),
          { concurrency: 8 },
        );
      });

      const removeManaged = Effect.fn("DnsManager.removeManaged")(function* (
        tunnelId: string,
      ): Effect.fn.Return<void, ManagerErrors> {
        const recordsByZone = yield* listRecordsByZone(tunnelId);
        yield* Effect.forEach(
          recordsByZone,
          ({ zoneId, records }) =>
            Effect.forEach(
              records.filter((record) => isManagedForTunnel(record, tunnelId) && allowsCleanup(record)),
              (record) => api.del(api.zonePath(zoneId, `/dns_records/${record.id}`)),
              { concurrency: 8, discard: true },
            ),
          { concurrency: 8, discard: true },
        );
      });

      const list = Effect.fn("DnsManager.list")(function* (
        tunnelId: string,
      ): Effect.fn.Return<ReadonlyArray<DnsRecord>, ManagerErrors> {
        const recordsByZone = yield* listRecordsByZone(tunnelId);
        return recordsByZone.flatMap(({ records }) =>
          records.map(
            (record) =>
              new DnsRecord({
                hostname: record.name,
                type: record.type,
                content: record.content,
              }),
          ),
        );
      });

      return DnsManager.of({ ensure, remove, removeManaged, list });
    }),
  );
}
