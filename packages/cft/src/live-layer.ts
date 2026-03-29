import { Effect, Layer, Redacted, Stream } from "effect"
import {
  TunnelOperations,
  IngressManager,
  DnsManager,
  RouteManager,
  VNetManager,
  TunnelProcessService,
  CloudflaredBinary,
  CloudflareApiConfig,
  LiveLayer as SdkLiveLayer,
  expose as sdkExpose,
  type TunnelInfo as SdkTunnelInfo,
  IngressRule,
} from "tunnel-sdk/effect"
import { CftError } from "./errors.js"
import {
  QuickTunnelService,
  TunnelApiService,
  IngressService,
  RouteService,
  DnsService,
  VNetService,
  ConfigService,
  AuthService,
  type TunnelInfo,
  type CreateTunnelOptions,
  type ListTunnelOptions,
  type DeleteTunnelOptions,
  type RunTunnelOptions,
  type VNetCreateOptions,
} from "./services.js"

// ---------------------------------------------------------------------------
// Error mapping: SDK errors → CftError
// ---------------------------------------------------------------------------

const mapSdkError = (e: unknown): CftError => {
  if (typeof e === "object" && e !== null && "_tag" in e) {
    const err = e as { _tag: string; message?: string; tunnelRef?: string; status?: number; errors?: Array<{ message: string }> }
    switch (err._tag) {
      case "TunnelAuthError":
        return CftError.AuthError({ message: err.message ?? "Authentication failed" })
      case "TunnelNotFoundError":
        return CftError.UserError({ message: `Tunnel not found: ${err.tunnelRef}` })
      case "TunnelApiError": {
        const errors = err.errors ?? []
        const msg = errors.length > 0
          ? errors.map((e) => e.message).join("; ")
          : `API error (status ${err.status})`
        return CftError.NetworkError({ message: msg, cause: e })
      }
      case "TunnelProcessError":
        return CftError.TunnelRuntimeError({ message: err.message ?? "Process error" })
      case "BinaryInstallError":
        return CftError.TunnelRuntimeError({ message: err.message ?? "Binary install failed" })
      case "TunnelSdkError":
        return CftError.UserError({ message: err.message ?? "SDK error" })
      case "ConfigValidationError":
        return CftError.UserError({ message: err.message ?? "Config validation error" })
    }
  }
  return CftError.NetworkError({ message: String(e), cause: e })
}

/**
 * Wrap an SDK effect, mapping all SDK errors to CftError.
 * The returned effect has the same R (requirements) as the input.
 */
const catchSdkErrors = <A, R>(
  effect: Effect.Effect<A, any, R>,
): Effect.Effect<A, CftError, R> =>
  Effect.catch(effect, (e: unknown) => Effect.fail(mapSdkError(e)))

// ---------------------------------------------------------------------------
// SDK TunnelInfo → cft TunnelInfo
// ---------------------------------------------------------------------------

const toCftTunnelInfo = (t: SdkTunnelInfo): TunnelInfo => ({
  id: t.id,
  name: t.name,
  status: t.status,
  connections: t.connections.length,
})

// ---------------------------------------------------------------------------
// QuickTunnelService — wraps SDK expose()
// ---------------------------------------------------------------------------

const QuickTunnelServiceLive = Layer.effect(
  QuickTunnelService,
  Effect.gen(function* () {
    return {
      expose: (port: number) =>
        catchSdkErrors(
          sdkExpose(port).pipe(
            Effect.scoped,
            Effect.map((result) => ({ url: result.url })),
          ),
        ),
    }
  }),
)

// ---------------------------------------------------------------------------
// TunnelApiService — wraps SDK TunnelOperations + TunnelProcessService
// ---------------------------------------------------------------------------

const TunnelApiServiceLive = Layer.effect(
  TunnelApiService,
  Effect.gen(function* () {
    const ops = yield* TunnelOperations
    const processSvc = yield* TunnelProcessService

    return {
      create: (name: string, opts?: CreateTunnelOptions) =>
        catchSdkErrors(
          ops.create(name, opts?.dns ? { dns: { auto: true } } : undefined).pipe(
            Effect.map(toCftTunnelInfo),
          ),
        ),

      list: (opts?: ListTunnelOptions) =>
        catchSdkErrors(
          ops.list(opts?.status ? { status: opts.status as any } : undefined).pipe(
            Effect.map((tunnels) => tunnels.map(toCftTunnelInfo)),
          ),
        ),

      get: (ref: string) =>
        catchSdkErrors(ops.get(ref).pipe(Effect.map(toCftTunnelInfo))),

      delete: (ref: string, opts?: DeleteTunnelOptions) =>
        catchSdkErrors(ops.del(ref, { force: opts?.force })),

      getToken: (ref: string) =>
        catchSdkErrors(ops.getToken(ref)),

      // run/stop/getLogs need more complex state management.
      // For now, run gets a token and starts the process but doesn't persist state.
      run: (ref: string, opts?: RunTunnelOptions) =>
        catchSdkErrors(
          Effect.gen(function* () {
            const tunnel = yield* ops.get(ref)
            const token = yield* ops.getToken(tunnel.id)
            // TODO: Store the running tunnel handle for stop/getLogs
            yield* processSvc.run(token, { logLevel: opts?.logLevel }).pipe(Effect.scoped)
          }),
        ),

      stop: (_ref: string) =>
        Effect.fail(CftError.UserError({
          message: "Tunnel stop not yet implemented — requires running tunnel state management",
        })),

      getLogs: (_ref: string) =>
        Effect.fail(CftError.UserError({
          message: "Tunnel logs not yet implemented — requires running tunnel state management",
        })),
    }
  }),
)

// ---------------------------------------------------------------------------
// IngressService — wraps SDK IngressManager
// Note: cft IngressService doesn't carry tunnel ID context.
// The adapter uses the first active tunnel. This is a known limitation.
// ---------------------------------------------------------------------------

const IngressServiceLive = Layer.effect(
  IngressService,
  Effect.gen(function* () {
    const ingress = yield* IngressManager
    const ops = yield* TunnelOperations

    const getActiveTunnelId: Effect.Effect<string, CftError> =
      catchSdkErrors(
        ops.list({ status: "healthy" }).pipe(
          Effect.flatMap((tunnels) =>
            tunnels.length > 0
              ? Effect.succeed(tunnels[0].id)
              : Effect.fail(CftError.UserError({
                  message: "No active tunnel found. Create and run a tunnel first.",
                })),
          ),
        ),
      )

    return {
      add: (hostname: string, service: string) =>
        Effect.gen(function* () {
          const tunnelId = yield* getActiveTunnelId
          yield* catchSdkErrors(
            ingress.add(tunnelId, new IngressRule({ hostname, service })),
          )
        }),

      list: () =>
        Effect.gen(function* () {
          const tunnelId = yield* getActiveTunnelId
          const rules = yield* catchSdkErrors(ingress.list(tunnelId))
          return rules.map((r) => ({
            hostname: r.hostname ?? "",
            service: r.service,
          }))
        }),

      remove: (hostname: string) =>
        Effect.gen(function* () {
          const tunnelId = yield* getActiveTunnelId
          yield* catchSdkErrors(ingress.remove(tunnelId, hostname))
        }),
    }
  }),
)

// ---------------------------------------------------------------------------
// DnsService — wraps SDK DnsManager
// ---------------------------------------------------------------------------

const DnsServiceLive = Layer.effect(
  DnsService,
  Effect.gen(function* () {
    const dns = yield* DnsManager
    const ops = yield* TunnelOperations

    return {
      create: (hostname: string, tunnel: string) =>
        Effect.gen(function* () {
          const t = yield* catchSdkErrors(ops.get(tunnel))
          yield* catchSdkErrors(dns.ensure(t.id, hostname))
        }),

      list: () =>
        catchSdkErrors(
          ops.list().pipe(
            Effect.flatMap((tunnels) =>
              Effect.all(
                tunnels.map((t) =>
                  dns.list(t.id).pipe(
                    Effect.map((records) =>
                      records.map((r) => ({
                        hostname: r.hostname,
                        tunnel: t.name,
                      })),
                    ),
                  ),
                ),
              ),
            ),
            Effect.map((arrays) => arrays.flat()),
          ),
        ),

      remove: (hostname: string) =>
        Effect.gen(function* () {
          const tunnels = yield* catchSdkErrors(ops.list())
          for (const t of tunnels) {
            const records = yield* catchSdkErrors(dns.list(t.id))
            if (records.some((r) => r.hostname === hostname)) {
              yield* catchSdkErrors(dns.remove(t.id, hostname))
              return
            }
          }
          yield* Effect.fail(
            CftError.UserError({ message: `DNS record not found: ${hostname}` }),
          )
        }),
    }
  }),
)

// ---------------------------------------------------------------------------
// RouteService — wraps SDK RouteManager
// ---------------------------------------------------------------------------

const RouteServiceLive = Layer.effect(
  RouteService,
  Effect.gen(function* () {
    const routes = yield* RouteManager
    const ops = yield* TunnelOperations

    return {
      add: (network: string, tunnel: string) =>
        Effect.gen(function* () {
          const t = yield* catchSdkErrors(ops.get(tunnel))
          yield* catchSdkErrors(routes.add(t.id, network))
        }),

      list: () =>
        catchSdkErrors(
          ops.list().pipe(
            Effect.flatMap((tunnels) =>
              Effect.all(
                tunnels.map((t) =>
                  routes.list(t.id).pipe(
                    Effect.map((rs) =>
                      rs.map((r) => ({
                        network: r.network,
                        tunnel: t.name,
                      })),
                    ),
                  ),
                ),
              ),
            ),
            Effect.map((arrays) => arrays.flat()),
          ),
        ),

      remove: (network: string) =>
        Effect.gen(function* () {
          const tunnels = yield* catchSdkErrors(ops.list())
          for (const t of tunnels) {
            const rs = yield* catchSdkErrors(routes.list(t.id))
            if (rs.some((r) => r.network === network)) {
              yield* catchSdkErrors(routes.remove(t.id, network))
              return
            }
          }
          yield* Effect.fail(
            CftError.UserError({ message: `Route not found: ${network}` }),
          )
        }),
    }
  }),
)

// ---------------------------------------------------------------------------
// VNetService — wraps SDK VNetManager (cleanest 1:1 mapping)
// ---------------------------------------------------------------------------

const VNetServiceLive = Layer.effect(
  VNetService,
  Effect.gen(function* () {
    const vnets = yield* VNetManager

    return {
      create: (name: string, opts?: VNetCreateOptions) =>
        catchSdkErrors(
          vnets.create(name, { default: opts?.isDefault }).pipe(Effect.asVoid),
        ),

      list: () =>
        catchSdkErrors(
          vnets.list().pipe(
            Effect.map((vs) => vs.map((v) => ({ name: v.name, isDefault: v.isDefault }))),
          ),
        ),

      delete: (name: string) =>
        catchSdkErrors(vnets.del(name)),
    }
  }),
)

// ---------------------------------------------------------------------------
// ConfigService + AuthService — stubs (CLI-specific, no SDK counterpart)
// ---------------------------------------------------------------------------

const notImplemented = (name: string) =>
  Effect.fail(CftError.UserError({ message: `${name} is not yet connected to a real backend` }))

const ConfigServiceStub = Layer.succeed(ConfigService, {
  validate: () => notImplemented("Config.validate"),
  diff: () => notImplemented("Config.diff"),
  push: () => notImplemented("Config.push"),
  pull: () => notImplemented("Config.pull"),
  init: () => notImplemented("Config.init"),
})

const AuthServiceStub = Layer.succeed(AuthService, {
  loginWithToken: () => notImplemented("Auth.loginWithToken"),
  status: () => notImplemented("Auth.status"),
  logout: () => notImplemented("Auth.logout"),
})

// ---------------------------------------------------------------------------
// Composed LiveLayer
// ---------------------------------------------------------------------------

/**
 * Create the full cft LiveLayer backed by real SDK services.
 */
export const LiveLayer = (config: CloudflareApiConfig) => {
  const sdkLayer = SdkLiveLayer(config)

  const adapterLayers = Layer.mergeAll(
    QuickTunnelServiceLive,
    TunnelApiServiceLive,
    IngressServiceLive,
    DnsServiceLive,
    RouteServiceLive,
    VNetServiceLive,
  ).pipe(Layer.provide(sdkLayer))

  return Layer.mergeAll(
    adapterLayers,
    ConfigServiceStub,
    AuthServiceStub,
  )
}

/**
 * Create LiveLayer from environment variables.
 * Reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.
 */
export const LiveLayerFromEnv = () => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN

  if (!accountId || !apiToken) {
    throw new Error(
      "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN environment variables. " +
      "Run `cft auth login` to configure.",
    )
  }

  return LiveLayer(
    new CloudflareApiConfig({
      accountId,
      apiToken: Redacted.make(apiToken),
    }),
  )
}
