import { Effect, Exit, Layer, ManagedRuntime, Redacted, Scope, Stream } from "effect";
import {
  CloudflareApiConfig,
  TunnelOperations as TunnelOpsService,
  IngressManager as IngressService,
  DnsManager as DnsService,
  RouteManager as RouteService,
  VNetManager as VNetService,
  TunnelProcessService,
  CloudflaredBinary,
  LiveLayer,
  expose as exposeEffect,
} from "./effect/index.js";
import type {
  TunnelInfo,
  IngressRule,
  Route,
  DnsRecord,
  VNet,
  RouteCheckResult,
  CreateTunnelOptions,
  TunnelListOptions,
  DeleteOptions,
} from "./effect/index.js";

// ---------------------------------------------------------------------------
// Re-export types for non-Effect consumers
// ---------------------------------------------------------------------------

export type {
  TunnelInfo,
  IngressRule,
  Route,
  DnsRecord,
  VNet,
  RouteCheckResult,
  RunningTunnel,
  TunnelEvent,
  RunOptions,
  CreateTunnelOptions,
  TunnelListOptions,
  DeleteOptions,
} from "./effect/index.js";

export type {
  TunnelStatus,
  ConnectorInfo,
  LogEntry,
} from "./effect/index.js";

// Re-export config validation
export {
  parseConfig,
  parseConfigFromYaml,
  parseConfigFromFile,
} from "./effect/config.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface TunnelClientOptions {
  accountId: string;
  apiToken: string;
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// Runtime type — the context provided by LiveLayer
// ---------------------------------------------------------------------------

type ClientServices =
  | TunnelOpsService
  | IngressService
  | DnsService
  | RouteService
  | VNetService
  | CloudflaredBinary
  | TunnelProcessService;

// The LiveLayer may error with BinaryInstallError during layer setup
type ClientRuntime = ManagedRuntime.ManagedRuntime<any, any>;

// ---------------------------------------------------------------------------
// Sub-clients
// ---------------------------------------------------------------------------

class TunnelClientTunnels {
  constructor(private readonly runtime: ClientRuntime) { }

  async create(name: string, options?: CreateTunnelOptions): Promise<TunnelInfo> {
    return this.runtime.runPromise(
      TunnelOpsService.use((s) => s.create(name, options)),
    );
  }

  async list(options?: TunnelListOptions): Promise<TunnelInfo[]> {
    const result = await this.runtime.runPromise(
      TunnelOpsService.use((s) => s.list(options)),
    );
    return [...result];
  }

  async get(nameOrId: string): Promise<TunnelInfo> {
    return this.runtime.runPromise(
      TunnelOpsService.use((s) => s.get(nameOrId)),
    );
  }

  async delete(nameOrId: string, options?: DeleteOptions): Promise<void> {
    return this.runtime.runPromise(
      TunnelOpsService.use((s) => s.del(nameOrId, options)),
    );
  }

  async getToken(tunnelId: string): Promise<string> {
    return this.runtime.runPromise(
      TunnelOpsService.use((s) => s.getToken(tunnelId)),
    );
  }

  async *listAll(): AsyncGenerator<TunnelInfo> {
    const items = await this.runtime.runPromise(
      TunnelOpsService.use((s) =>
        s.listAll().pipe(Stream.runCollect),
      ),
    );
    for (const item of items) {
      yield item;
    }
  }
}

class TunnelClientIngress {
  constructor(private readonly runtime: ClientRuntime) { }

  async list(tunnelId: string): Promise<IngressRule[]> {
    const result = await this.runtime.runPromise(
      IngressService.use((s) => s.list(tunnelId)),
    );
    return [...result];
  }

  async add(tunnelId: string, rule: IngressRule): Promise<void> {
    return this.runtime.runPromise(
      IngressService.use((s) => s.add(tunnelId, rule)),
    );
  }

  async remove(tunnelId: string, hostname: string): Promise<void> {
    return this.runtime.runPromise(
      IngressService.use((s) => s.remove(tunnelId, hostname)),
    );
  }

  async set(tunnelId: string, rules: ReadonlyArray<IngressRule>): Promise<void> {
    return this.runtime.runPromise(
      IngressService.use((s) => s.set(tunnelId, rules)),
    );
  }
}

class TunnelClientDns {
  constructor(private readonly runtime: ClientRuntime) { }

  async ensure(
    tunnelId: string,
    hostname: string,
    options?: { proxied?: boolean; ttl?: number; },
  ): Promise<void> {
    return this.runtime.runPromise(
      DnsService.use((s) => s.ensure(tunnelId, hostname, options)),
    );
  }

  async remove(tunnelId: string, hostname: string): Promise<void> {
    return this.runtime.runPromise(
      DnsService.use((s) => s.remove(tunnelId, hostname)),
    );
  }

  async list(tunnelId: string): Promise<DnsRecord[]> {
    const result = await this.runtime.runPromise(
      DnsService.use((s) => s.list(tunnelId)),
    );
    return [...result];
  }
}

class TunnelClientRoutes {
  constructor(private readonly runtime: ClientRuntime) { }

  async add(
    tunnelId: string,
    network: string,
    options?: { vnet?: string; comment?: string; },
  ): Promise<void> {
    return this.runtime.runPromise(
      RouteService.use((s) => s.add(tunnelId, network, options)),
    );
  }

  async remove(tunnelId: string, network: string): Promise<void> {
    return this.runtime.runPromise(
      RouteService.use((s) => s.remove(tunnelId, network)),
    );
  }

  async list(tunnelId: string): Promise<Route[]> {
    const result = await this.runtime.runPromise(
      RouteService.use((s) => s.list(tunnelId)),
    );
    return [...result];
  }

  async check(ip: string): Promise<RouteCheckResult | null> {
    return this.runtime.runPromise(
      RouteService.use((s) => s.check(ip)),
    );
  }
}

class TunnelClientVNets {
  constructor(private readonly runtime: ClientRuntime) { }

  async create(
    name: string,
    options?: { default?: boolean; comment?: string; },
  ): Promise<VNet> {
    return this.runtime.runPromise(
      VNetService.use((s) => s.create(name, options)),
    );
  }

  async delete(name: string): Promise<void> {
    return this.runtime.runPromise(
      VNetService.use((s) => s.del(name)),
    );
  }

  async list(): Promise<VNet[]> {
    const result = await this.runtime.runPromise(
      VNetService.use((s) => s.list()),
    );
    return [...result];
  }
}

// ---------------------------------------------------------------------------
// TunnelClient
// ---------------------------------------------------------------------------

export class TunnelClient {
  /** @internal */
  readonly _runtime: ClientRuntime;

  readonly tunnels: TunnelClientTunnels;
  readonly ingress: TunnelClientIngress;
  readonly dns: TunnelClientDns;
  readonly routes: TunnelClientRoutes;
  readonly vnets: TunnelClientVNets;

  constructor(options: TunnelClientOptions) {
    const config = new CloudflareApiConfig({
      accountId: options.accountId,
      apiToken: Redacted.make(options.apiToken),
      baseUrl: options.baseUrl,
    });
    this._runtime = ManagedRuntime.make(LiveLayer(config));
    this.tunnels = new TunnelClientTunnels(this._runtime);
    this.ingress = new TunnelClientIngress(this._runtime);
    this.dns = new TunnelClientDns(this._runtime);
    this.routes = new TunnelClientRoutes(this._runtime);
    this.vnets = new TunnelClientVNets(this._runtime);
  }

  /** Create a TunnelClient from any Layer (for testing). @internal */
  static _fromLayer(layer: Layer.Layer<ClientServices, any, never>): TunnelClient {
    const client = Object.create(TunnelClient.prototype);
    client._runtime = ManagedRuntime.make(layer);
    client.tunnels = new TunnelClientTunnels(client._runtime);
    client.ingress = new TunnelClientIngress(client._runtime);
    client.dns = new TunnelClientDns(client._runtime);
    client.routes = new TunnelClientRoutes(client._runtime);
    client.vnets = new TunnelClientVNets(client._runtime);
    return client;
  }

  async dispose(): Promise<void> {
    await this._runtime.dispose();
  }
}

// ---------------------------------------------------------------------------
// expose() wrapper
// ---------------------------------------------------------------------------

export interface ExposedTunnel {
  readonly url: string;
  close(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
}

/**
 * Quick-expose a local port via a Cloudflare tunnel (anonymous, no account needed).
 * Returns the generated trycloudflare URL. Call `.close()` or use `await using` to shut down.
 *
 * Optionally pass a custom `binaryLayer` for testing.
 */
export async function expose(
  port: number,
  options?: { _binaryLayer?: Layer.Layer<CloudflaredBinary>; },
): Promise<ExposedTunnel> {
  const binaryLayer = options?._binaryLayer ?? CloudflaredBinary.layer;
  const runtime = ManagedRuntime.make(binaryLayer);

  // Create a scope we control — keeps the tunnel process alive until close()
  const scope = Effect.runSync(Scope.make());

  const result = await runtime.runPromise(
    exposeEffect(port).pipe(
      Effect.provideService(Scope.Scope, scope),
    ),
  );

  const cleanup = async () => {
    // Close scope first — triggers SIGTERM finalizer on the tunnel process
    await Effect.runPromise(Scope.close(scope, Exit.void));
    // Then dispose the runtime
    await runtime.dispose();
  };

  return {
    url: result.url,
    close: cleanup,
    [Symbol.asyncDispose]: cleanup,
  };
}
