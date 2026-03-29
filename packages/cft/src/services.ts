import { Effect, ServiceMap } from "effect"
import type { CftError } from "./errors.js"

// --- QuickTunnelService ---
// Handles anonymous quick tunnels (no auth required)

export interface QuickTunnelResult {
  readonly url: string
}

export interface QuickTunnel {
  readonly expose: (port: number) => Effect.Effect<QuickTunnelResult, CftError>
}

export const QuickTunnelService = ServiceMap.Service<QuickTunnel>("cft/QuickTunnel")

// --- TunnelApiService ---
// Handles named tunnel CRUD via Cloudflare API

export interface TunnelInfo {
  readonly id: string
  readonly name: string
  readonly status?: string
  readonly connections?: number
  readonly maxConnections?: number
  readonly uptime?: string
  readonly colo?: string
}

export interface CreateTunnelOptions {
  readonly dns?: boolean
}

export interface ListTunnelOptions {
  readonly status?: string
}

export interface DeleteTunnelOptions {
  readonly force?: boolean
}

export interface RunTunnelOptions {
  readonly logLevel?: "debug" | "info" | "warn" | "error"
}

export interface TunnelLogEntry {
  readonly timestamp: string
  readonly level: string
  readonly message: string
}

export interface TunnelApi {
  readonly create: (name: string, opts?: CreateTunnelOptions) => Effect.Effect<TunnelInfo, CftError>
  readonly list: (opts?: ListTunnelOptions) => Effect.Effect<ReadonlyArray<TunnelInfo>, CftError>
  readonly get: (ref: string) => Effect.Effect<TunnelInfo, CftError>
  readonly delete: (ref: string, opts?: DeleteTunnelOptions) => Effect.Effect<void, CftError>
  readonly run: (ref: string, opts?: RunTunnelOptions) => Effect.Effect<void, CftError>
  readonly stop: (ref: string) => Effect.Effect<void, CftError>
  readonly getLogs: (ref: string) => Effect.Effect<ReadonlyArray<TunnelLogEntry>, CftError>
  readonly getToken: (ref: string) => Effect.Effect<string, CftError>
}

export const TunnelApiService = ServiceMap.Service<TunnelApi>("cft/TunnelApi")

// --- IngressService ---

export interface IngressRuleInfo {
  readonly hostname: string
  readonly service: string
}

export interface Ingress {
  readonly add: (hostname: string, service: string) => Effect.Effect<void, CftError>
  readonly list: () => Effect.Effect<ReadonlyArray<IngressRuleInfo>, CftError>
  readonly remove: (hostname: string) => Effect.Effect<void, CftError>
}

export const IngressService = ServiceMap.Service<Ingress>("cft/Ingress")

// --- RouteService ---

export interface RouteInfo {
  readonly network: string
  readonly tunnel: string
}

export interface Route {
  readonly add: (network: string, tunnel: string) => Effect.Effect<void, CftError>
  readonly list: () => Effect.Effect<ReadonlyArray<RouteInfo>, CftError>
  readonly remove: (network: string) => Effect.Effect<void, CftError>
}

export const RouteService = ServiceMap.Service<Route>("cft/Route")

// --- DnsService ---

export interface DnsRecordInfo {
  readonly hostname: string
  readonly tunnel: string
}

export interface Dns {
  readonly create: (hostname: string, tunnel: string) => Effect.Effect<void, CftError>
  readonly list: () => Effect.Effect<ReadonlyArray<DnsRecordInfo>, CftError>
  readonly remove: (hostname: string) => Effect.Effect<void, CftError>
}

export const DnsService = ServiceMap.Service<Dns>("cft/Dns")

// --- VNetService ---

export interface VNetInfo {
  readonly name: string
  readonly isDefault: boolean
}

export interface VNetCreateOptions {
  readonly isDefault?: boolean
}

export interface VNet {
  readonly create: (name: string, opts?: VNetCreateOptions) => Effect.Effect<void, CftError>
  readonly list: () => Effect.Effect<ReadonlyArray<VNetInfo>, CftError>
  readonly delete: (name: string) => Effect.Effect<void, CftError>
}

export const VNetService = ServiceMap.Service<VNet>("cft/VNet")

// --- ConfigService ---

export interface ValidationResult {
  readonly valid: boolean
  readonly warnings: ReadonlyArray<string>
}

export interface ConfigDiff {
  readonly added: ReadonlyArray<string>
  readonly removed: ReadonlyArray<string>
  readonly unchanged: ReadonlyArray<string>
}

export interface Config {
  readonly validate: () => Effect.Effect<ValidationResult, CftError>
  readonly diff: () => Effect.Effect<ConfigDiff, CftError>
  readonly push: (opts?: { dryRun?: boolean }) => Effect.Effect<void, CftError>
  readonly pull: () => Effect.Effect<string, CftError>
  readonly init: () => Effect.Effect<string, CftError>
}

export const ConfigService = ServiceMap.Service<Config>("cft/Config")

// --- AuthService ---

export type AuthStatus =
  | { readonly authenticated: true; readonly email: string }
  | { readonly authenticated: false }

export interface Auth {
  readonly loginWithToken: (token: string) => Effect.Effect<void, CftError>
  readonly status: () => Effect.Effect<AuthStatus, CftError>
  readonly logout: () => Effect.Effect<void, CftError>
}

export const AuthService = ServiceMap.Service<Auth>("cft/Auth")
