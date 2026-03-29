import { Effect, Layer } from "effect"
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
} from "./services.js"

const notImplemented = (name: string) =>
  Effect.fail(CftError.UserError({ message: `${name} is not yet connected to a real backend` }))

/** Placeholder layers for all services. Replace with real implementations. */
export const LiveLayer = Layer.mergeAll(
  Layer.succeed(QuickTunnelService, {
    expose: () => notImplemented("QuickTunnel.expose"),
  }),
  Layer.succeed(TunnelApiService, {
    create: () => notImplemented("TunnelApi.create"),
    list: () => notImplemented("TunnelApi.list"),
    get: () => notImplemented("TunnelApi.get"),
    delete: () => notImplemented("TunnelApi.delete"),
    run: () => notImplemented("TunnelApi.run"),
    stop: () => notImplemented("TunnelApi.stop"),
    getLogs: () => notImplemented("TunnelApi.getLogs"),
    getToken: () => notImplemented("TunnelApi.getToken"),
  }),
  Layer.succeed(IngressService, {
    add: () => notImplemented("Ingress.add"),
    list: () => notImplemented("Ingress.list"),
    remove: () => notImplemented("Ingress.remove"),
  }),
  Layer.succeed(RouteService, {
    add: () => notImplemented("Route.add"),
    list: () => notImplemented("Route.list"),
    remove: () => notImplemented("Route.remove"),
  }),
  Layer.succeed(DnsService, {
    create: () => notImplemented("Dns.create"),
    list: () => notImplemented("Dns.list"),
    remove: () => notImplemented("Dns.remove"),
  }),
  Layer.succeed(VNetService, {
    create: () => notImplemented("VNet.create"),
    list: () => notImplemented("VNet.list"),
    delete: () => notImplemented("VNet.delete"),
  }),
  Layer.succeed(ConfigService, {
    validate: () => notImplemented("Config.validate"),
    diff: () => notImplemented("Config.diff"),
    push: () => notImplemented("Config.push"),
    pull: () => notImplemented("Config.pull"),
    init: () => notImplemented("Config.init"),
  }),
  Layer.succeed(AuthService, {
    loginWithToken: () => notImplemented("Auth.loginWithToken"),
    status: () => notImplemented("Auth.status"),
    logout: () => notImplemented("Auth.logout"),
  }),
)
