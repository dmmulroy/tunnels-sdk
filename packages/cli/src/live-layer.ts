import { Effect, Exit, Layer, Redacted, Ref, Scope, Stream } from "effect"
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
  type RunningTunnel,
  type LogEntry,
  IngressRule,
} from "tunnels/effect"
import { CliError } from "./errors.js"
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
// Error mapping: SDK errors → CliError
// ---------------------------------------------------------------------------

const mapSdkError = (e: unknown): CliError => {
  if (typeof e === "object" && e !== null && "_tag" in e) {
    const err = e as { _tag: string; message?: string; tunnelRef?: string; status?: number; errors?: Array<{ message: string }> }
    switch (err._tag) {
      case "TunnelAuthError":
        return CliError.AuthError({ message: err.message ?? "Authentication failed" })
      case "TunnelNotFoundError":
        return CliError.UserError({ message: `Tunnel not found: ${err.tunnelRef}` })
      case "TunnelApiError": {
        const errors = err.errors ?? []
        const msg = errors.length > 0
          ? errors.map((e) => e.message).join("; ")
          : `API error (status ${err.status})`
        return CliError.NetworkError({ message: msg, cause: e })
      }
      case "TunnelProcessError":
        return CliError.TunnelRuntimeError({ message: err.message ?? "Process error" })
      case "BinaryInstallError":
        return CliError.TunnelRuntimeError({ message: err.message ?? "Binary install failed" })
      case "TunnelSdkError":
        return CliError.UserError({ message: err.message ?? "SDK error" })
      case "ConfigValidationError":
        return CliError.UserError({ message: err.message ?? "Config validation error" })
    }
  }
  return CliError.NetworkError({ message: String(e), cause: e })
}

/**
 * Wrap an SDK effect, mapping all SDK errors to CliError.
 * The returned effect has the same R (requirements) as the input.
 */
const catchSdkErrors = <A, R>(
  effect: Effect.Effect<A, any, R>,
): Effect.Effect<A, CliError, R> =>
  Effect.catch(effect, (e: unknown) => Effect.fail(mapSdkError(e)))

// ---------------------------------------------------------------------------
// SDK TunnelInfo → CLI TunnelInfo
// ---------------------------------------------------------------------------

const toCliTunnelInfo = (t: SdkTunnelInfo): TunnelInfo => ({
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

// ---------------------------------------------------------------------------
// Running tunnel handle — tracks a running tunnel process for stop/getLogs
// ---------------------------------------------------------------------------

interface RunningTunnelHandle {
  readonly tunnelId: string
  readonly tunnelName: string
  readonly scope: Scope.Closeable
  readonly tunnel: RunningTunnel
}

export const TunnelApiServiceLive = Layer.effect(
  TunnelApiService,
  Effect.gen(function* () {
    const ops = yield* TunnelOperations
    const processSvc = yield* TunnelProcessService

    // Track running tunnels by name AND id for flexible lookup
    const runningRef = yield* Ref.make<ReadonlyArray<RunningTunnelHandle>>([])

    const findRunning = (ref: string) =>
      Ref.get(runningRef).pipe(
        Effect.map((handles) =>
          handles.find((h) => h.tunnelId === ref || h.tunnelName === ref),
        ),
      )

    return {
      create: (name: string, opts?: CreateTunnelOptions) =>
        catchSdkErrors(
          ops.create(name, opts?.dns ? { dns: { auto: true } } : undefined).pipe(
            Effect.map(toCliTunnelInfo),
          ),
        ),

      list: (opts?: ListTunnelOptions) =>
        catchSdkErrors(
          ops.list(opts?.status ? { status: opts.status as any } : undefined).pipe(
            Effect.map((tunnels) => tunnels.map(toCliTunnelInfo)),
          ),
        ),

      get: (ref: string) =>
        catchSdkErrors(ops.get(ref).pipe(Effect.map(toCliTunnelInfo))),

      delete: (ref: string, opts?: DeleteTunnelOptions) =>
        catchSdkErrors(ops.del(ref, { force: opts?.force })),

      getToken: (ref: string) =>
        catchSdkErrors(ops.getToken(ref)),

      run: (ref: string, opts?: RunTunnelOptions) =>
        catchSdkErrors(
          Effect.gen(function* () {
            const tunnelInfo = yield* ops.get(ref)
            const token = yield* ops.getToken(tunnelInfo.id)

            // Create a scope we control — close it to kill the process
            const scope = yield* Scope.make()
            const runningTunnel = yield* processSvc
              .run(token, { logLevel: opts?.logLevel })
              .pipe(Effect.provideService(Scope.Scope, scope))

            const handle: RunningTunnelHandle = {
              tunnelId: tunnelInfo.id,
              tunnelName: tunnelInfo.name,
              scope,
              tunnel: runningTunnel,
            }

            yield* Ref.update(runningRef, (hs) => [...hs, handle])
          }),
        ),

      stop: (ref: string) =>
        Effect.gen(function* () {
          const handle = yield* findRunning(ref)
          if (!handle) {
            return yield* Effect.fail(
              CliError.UserError({ message: `No running tunnel found: ${ref}` }),
            )
          }
          // Close the scope — triggers SIGTERM finalizer in TunnelProcess
          yield* Scope.close(handle.scope, Exit.void)
          // Remove from running list
          yield* Ref.update(runningRef, (hs) =>
            hs.filter((h) => h.tunnelId !== handle.tunnelId),
          )
        }),

      getLogs: (ref: string) =>
        Effect.gen(function* () {
          const handle = yield* findRunning(ref)
          if (!handle) {
            return yield* Effect.fail(
              CliError.UserError({ message: `No running tunnel found: ${ref}` }),
            )
          }
          // Collect available log entries (take up to 100 recent)
          const entries = yield* handle.tunnel.logs.pipe(
            Stream.take(100),
            Stream.runCollect,
            Effect.timeout("100 millis"),
            Effect.catch(() => Effect.succeed([] as Iterable<LogEntry>)),
          )
          return Array.from(entries).map(
            (e): import("./services.js").TunnelLogEntry => ({
              timestamp: e.timestamp.toISOString(),
              level: e.level,
              message: e.message,
            }),
          )
        }),
    }
  }),
)

// ---------------------------------------------------------------------------
// IngressService — wraps SDK IngressManager
// Note: CLI IngressService doesn't carry tunnel ID context.
// The adapter uses the first active tunnel. This is a known limitation.
// ---------------------------------------------------------------------------

const IngressServiceLive = Layer.effect(
  IngressService,
  Effect.gen(function* () {
    const ingress = yield* IngressManager
    const ops = yield* TunnelOperations

    const getActiveTunnelId: Effect.Effect<string, CliError> =
      catchSdkErrors(
        ops.list({ status: "healthy" }).pipe(
          Effect.flatMap((tunnels) =>
            tunnels.length > 0
              ? Effect.succeed(tunnels[0].id)
              : Effect.fail(CliError.UserError({
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
            CliError.UserError({ message: `DNS record not found: ${hostname}` }),
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
            CliError.UserError({ message: `Route not found: ${network}` }),
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
  Effect.fail(CliError.UserError({ message: `${name} is not yet connected to a real backend` }))

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
 * Create the full CLI LiveLayer backed by real SDK services.
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
      "Run `tunnels auth login` to configure.",
    )
  }

  return LiveLayer(
    new CloudflareApiConfig({
      accountId,
      apiToken: Redacted.make(apiToken),
    }),
  )
}
