import { Effect, Layer, ServiceMap, Stream } from "effect";
import type { CfTunnel } from "../schemas.js";
import {
  TunnelApiError,
  TunnelAuthError,
  TunnelNotFoundError,
  TunnelSdkError,
} from "../errors.js";
import { IngressRule, TunnelConnection, TunnelInfo } from "../schemas.js";
import type { TunnelStatus } from "../schemas.js";
import { CloudflareApi } from "./CloudflareApi.js";
import { DnsManager } from "./DnsManager.js";
import { IngressManager } from "./IngressManager.js";
import { RouteManager } from "./RouteManager.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options used when creating a named Cloudflare tunnel.
 */
export interface CreateTunnelOptions {
  readonly ingress?: ReadonlyArray<IngressRule>;
  readonly dns?: boolean | { auto?: boolean; cleanup?: boolean; overwrite?: boolean; };
  readonly routes?: ReadonlyArray<{ network: string; vnet?: string; comment?: string; }>;
}

/**
 * Filters for listing Cloudflare tunnels.
 */
export interface TunnelListOptions {
  readonly status?: TunnelStatus;
  readonly name?: string;
  readonly search?: string;
}

/**
 * Options used when deleting a named Cloudflare tunnel.
 */
export interface DeleteOptions {
  readonly force?: boolean;
  readonly cleanupDns?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_STATUSES = new Set<TunnelStatus>(["healthy", "inactive", "degraded", "down"]);

const toTunnelStatus = (raw: string): TunnelStatus =>
  VALID_STATUSES.has(raw as TunnelStatus) ? (raw as TunnelStatus) : "inactive";

const mapCfTunnel = (cf: CfTunnel): TunnelInfo =>
  new TunnelInfo({
    id: cf.id,
    name: cf.name,
    status: toTunnelStatus(cf.status),
    createdAt: cf.created_at,
    deletedAt: cf.deleted_at,
    connections: (cf.connections ?? []).map(
      (c) =>
        new TunnelConnection({
          id: c.id,
          colo: c.colo_name,
          ip: c.origin_ip,
          location: c.colo_name,
          openedAt: c.opened_at,
          clientVersion: c.client_version,
          isPendingReconnect: c.is_pending_reconnect,
        }),
    ),
    remoteConfig: cf.remote_config,
  });

const generateSecret = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64");
};

const dnsPolicy = (dns: CreateTunnelOptions["dns"]) => {
  if (dns === false) {
    return { auto: false, cleanup: false, overwrite: false };
  }
  if (dns === true || dns === undefined) {
    return { auto: true, cleanup: true, overwrite: false };
  }
  return {
    auto: dns.auto ?? true,
    cleanup: dns.cleanup ?? true,
    overwrite: dns.overwrite ?? false,
  };
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

type OpErrors = TunnelApiError | TunnelAuthError | TunnelSdkError | TunnelNotFoundError;

/**
 * High-level Effect service for named tunnel lifecycle operations.
 */
export class TunnelOperations extends ServiceMap.Service<
  TunnelOperations,
  {
    /**
     * Creates a new named tunnel.
     */
    create(name: string, options?: CreateTunnelOptions): Effect.Effect<TunnelInfo, OpErrors>;
    /**
     * Gets an existing tunnel by exact name or creates it.
     */
    for(name: string, options?: CreateTunnelOptions): Effect.Effect<TunnelInfo, OpErrors>;
    /**
     * Lists named tunnels with optional filters.
     */
    list(options?: TunnelListOptions): Effect.Effect<ReadonlyArray<TunnelInfo>, OpErrors>;
    /**
     * Streams all named tunnels across paginated API responses.
     */
    listAll(): Stream.Stream<TunnelInfo, TunnelApiError | TunnelAuthError>;
    /**
     * Gets a tunnel by UUID or exact name.
     */
    get(nameOrId: string): Effect.Effect<TunnelInfo, OpErrors>;
    /**
     * Deletes a tunnel by UUID or exact name.
     */
    del(nameOrId: string, options?: DeleteOptions): Effect.Effect<void, OpErrors>;
    /**
     * Retrieves the run token for a tunnel ID.
     */
    getToken(tunnelId: string): Effect.Effect<string, TunnelApiError | TunnelAuthError>;
    /**
     * Refreshes tunnel metadata from Cloudflare.
     */
    refresh(tunnelId: string): Effect.Effect<TunnelInfo, TunnelApiError | TunnelAuthError>;
  }
>()("tunnels/TunnelOperations") {
  /**
   * Live tunnel operations layer backed by Cloudflare API and managers.
   */
  static readonly layer = Layer.effect(
    TunnelOperations,
    Effect.gen(function* () {
      const api = yield* CloudflareApi;
      const ingressMgr = yield* IngressManager;
      const dnsMgr = yield* DnsManager;
      const routeMgr = yield* RouteManager;

      const create = Effect.fn("TunnelOperations.create")(function* (
        name: string,
        options?: CreateTunnelOptions,
      ): Effect.fn.Return<TunnelInfo, OpErrors> {
        const cfTunnel = yield* api.post<CfTunnel>(
          api.accountPath("/cfd_tunnel"),
          { name, tunnel_secret: generateSecret(), config_src: "cloudflare" },
        );
        const info = mapCfTunnel(cfTunnel);

        if (options?.ingress?.length) {
          yield* ingressMgr.set(info.id, options.ingress);
        }

        const dns = dnsPolicy(options?.dns);
        if (dns.auto && options?.ingress) {
          yield* Effect.forEach(
            options.ingress,
            (rule) => rule.hostname
              ? dnsMgr.ensure(info.id, rule.hostname, {
                  cleanup: dns.cleanup,
                  overwrite: dns.overwrite,
                })
              : Effect.void,
            { concurrency: 8, discard: true },
          );
        }

        if (options?.routes) {
          yield* Effect.forEach(
            options.routes,
            (route) =>
              routeMgr.add(info.id, route.network, {
                vnet: route.vnet,
                comment: route.comment,
              }),
            { concurrency: 8, discard: true },
          );
        }

        return info;
      });

      const list = Effect.fn("TunnelOperations.list")(function* (
        options?: TunnelListOptions,
      ): Effect.fn.Return<ReadonlyArray<TunnelInfo>, OpErrors> {
        if (options?.name && options.search) {
          return yield* new TunnelSdkError({
            message: 'Use either "name" or "search", not both',
          });
        }

        const params: Record<string, string> = { is_deleted: "false" };
        if (options?.status) params.status = options.status;
        if (options?.name) params.name = options.name;
        if (options?.search) params.name = options.search;

        const tunnels = yield* api.get<CfTunnel[]>(
          api.accountPath("/cfd_tunnel"),
          params,
        );
        return tunnels.map(mapCfTunnel);
      });

      const listAll = (): Stream.Stream<TunnelInfo, TunnelApiError | TunnelAuthError> =>
        api
          .paginate<CfTunnel>(api.accountPath("/cfd_tunnel"), { is_deleted: "false" })
          .pipe(Stream.map(mapCfTunnel));

      const forTunnel = Effect.fn("TunnelOperations.for")(function* (
        name: string,
        options?: CreateTunnelOptions,
      ): Effect.fn.Return<TunnelInfo, OpErrors> {
        const tunnels = yield* list({ name });
        const existing = tunnels.find((tunnel) => tunnel.name === name);
        if (existing) return existing;
        return yield* create(name, options);
      });

      const get = Effect.fn("TunnelOperations.get")(function* (
        nameOrId: string,
      ): Effect.fn.Return<TunnelInfo, OpErrors> {
        if (UUID_RE.test(nameOrId)) {
          const cfTunnel = yield* api.get<CfTunnel>(
            api.accountPath(`/cfd_tunnel/${nameOrId}`),
          );
          return mapCfTunnel(cfTunnel);
        }

        const tunnels = yield* list({ name: nameOrId });
        const match = tunnels.find((t) => t.name === nameOrId);
        if (!match) {
          return yield* new TunnelNotFoundError({ tunnelRef: nameOrId });
        }
        return match;
      });

      const del = Effect.fn("TunnelOperations.del")(function* (
        nameOrId: string,
        options?: DeleteOptions,
      ): Effect.fn.Return<void, OpErrors> {
        const tunnel = yield* get(nameOrId);

        if (options?.cleanupDns !== false) {
          yield* dnsMgr.removeManaged(tunnel.id);
        }

        yield* api.del(
          api.accountPath(`/cfd_tunnel/${tunnel.id}`),
          options?.force ? { cascade: "true" } : undefined,
        );
      });

      const getToken = Effect.fn("TunnelOperations.getToken")(function* (
        tunnelId: string,
      ): Effect.fn.Return<string, TunnelApiError | TunnelAuthError> {
        return yield* api.get<string>(
          api.accountPath(`/cfd_tunnel/${tunnelId}/token`),
        );
      });

      const refresh = Effect.fn("TunnelOperations.refresh")(function* (
        tunnelId: string,
      ): Effect.fn.Return<TunnelInfo, TunnelApiError | TunnelAuthError> {
        const cfTunnel = yield* api.get<CfTunnel>(
          api.accountPath(`/cfd_tunnel/${tunnelId}`),
        );
        return mapCfTunnel(cfTunnel);
      });

      return TunnelOperations.of({
        create,
        for: forTunnel,
        list,
        listAll,
        get,
        del,
        getToken,
        refresh,
      });
    }),
  );
}
