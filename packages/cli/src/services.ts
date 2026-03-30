import { Effect, ServiceMap } from "effect"
import type { CliError } from "./errors.js"

// --- QuickTunnelService ---
// Handles anonymous quick tunnels (no auth required)

export interface QuickTunnelResult {
  readonly url: string
}

export interface QuickTunnel {
  readonly expose: (port: number) => Effect.Effect<QuickTunnelResult, CliError>
}

export const QuickTunnelService = ServiceMap.Service<QuickTunnel>("tunnels-cli/QuickTunnel")

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
  readonly create: (name: string, opts?: CreateTunnelOptions) => Effect.Effect<TunnelInfo, CliError>
  readonly list: (opts?: ListTunnelOptions) => Effect.Effect<ReadonlyArray<TunnelInfo>, CliError>
  readonly get: (ref: string) => Effect.Effect<TunnelInfo, CliError>
  readonly delete: (ref: string, opts?: DeleteTunnelOptions) => Effect.Effect<void, CliError>
  readonly run: (ref: string, opts?: RunTunnelOptions) => Effect.Effect<void, CliError>
  readonly stop: (ref: string) => Effect.Effect<void, CliError>
  readonly getLogs: (ref: string) => Effect.Effect<ReadonlyArray<TunnelLogEntry>, CliError>
  readonly getToken: (ref: string) => Effect.Effect<string, CliError>
}

export const TunnelApiService = ServiceMap.Service<TunnelApi>("tunnels-cli/TunnelApi")

// --- IngressService ---

export interface IngressRuleInfo {
  readonly hostname: string
  readonly service: string
}

export interface Ingress {
  readonly add: (hostname: string, service: string) => Effect.Effect<void, CliError>
  readonly list: () => Effect.Effect<ReadonlyArray<IngressRuleInfo>, CliError>
  readonly remove: (hostname: string) => Effect.Effect<void, CliError>
}

export const IngressService = ServiceMap.Service<Ingress>("tunnels-cli/Ingress")

// --- RouteService ---

export interface RouteInfo {
  readonly network: string
  readonly tunnel: string
}

export interface Route {
  readonly add: (network: string, tunnel: string) => Effect.Effect<void, CliError>
  readonly list: () => Effect.Effect<ReadonlyArray<RouteInfo>, CliError>
  readonly remove: (network: string) => Effect.Effect<void, CliError>
}

export const RouteService = ServiceMap.Service<Route>("tunnels-cli/Route")

// --- DnsService ---

export interface DnsRecordInfo {
  readonly hostname: string
  readonly tunnel: string
}

export interface Dns {
  readonly create: (hostname: string, tunnel: string) => Effect.Effect<void, CliError>
  readonly list: () => Effect.Effect<ReadonlyArray<DnsRecordInfo>, CliError>
  readonly remove: (hostname: string) => Effect.Effect<void, CliError>
}

export const DnsService = ServiceMap.Service<Dns>("tunnels-cli/Dns")

// --- VNetService ---

export interface VNetInfo {
  readonly name: string
  readonly isDefault: boolean
}

export interface VNetCreateOptions {
  readonly isDefault?: boolean
}

export interface VNet {
  readonly create: (name: string, opts?: VNetCreateOptions) => Effect.Effect<void, CliError>
  readonly list: () => Effect.Effect<ReadonlyArray<VNetInfo>, CliError>
  readonly delete: (name: string) => Effect.Effect<void, CliError>
}

export const VNetService = ServiceMap.Service<VNet>("tunnels-cli/VNet")

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
  readonly validate: () => Effect.Effect<ValidationResult, CliError>
  readonly diff: () => Effect.Effect<ConfigDiff, CliError>
  readonly push: (opts?: { dryRun?: boolean }) => Effect.Effect<void, CliError>
  readonly pull: () => Effect.Effect<string, CliError>
  readonly init: () => Effect.Effect<string, CliError>
}

export const ConfigService = ServiceMap.Service<Config>("tunnels-cli/Config")

// --- AuthService ---

export type AuthStatus =
  | { readonly authenticated: true; readonly email: string }
  | { readonly authenticated: false }

export interface Auth {
  readonly loginWithToken: (token: string) => Effect.Effect<void, CliError>
  readonly status: () => Effect.Effect<AuthStatus, CliError>
  readonly logout: () => Effect.Effect<void, CliError>
}

export const AuthService = ServiceMap.Service<Auth>("tunnels-cli/Auth")
