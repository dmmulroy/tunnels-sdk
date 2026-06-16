import { Effect, ServiceMap } from "effect"
import type { CliError } from "./errors.js"

// --- QuickTunnelService ---
// Handles anonymous quick tunnels (no auth required)

/**
 * Result returned after exposing a local port through an anonymous tunnel.
 */
export interface QuickTunnelResult {
  readonly url: string
}

/**
 * CLI service for anonymous quick tunnels.
 */
export interface QuickTunnel {
  readonly expose: (port: number) => Effect.Effect<QuickTunnelResult, CliError>
}

/**
 * Service tag for anonymous quick tunnel operations.
 */
export const QuickTunnelService = ServiceMap.Service<QuickTunnel>("tunnels-cli/QuickTunnel")

// --- TunnelApiService ---
// Handles named tunnel CRUD via Cloudflare API

/**
 * Tunnel summary displayed by CLI commands.
 */
export interface TunnelInfo {
  readonly id: string
  readonly name: string
  readonly status?: string
  readonly connections?: number
  readonly maxConnections?: number
  readonly uptime?: string
  readonly colo?: string
}

/**
 * Options for CLI tunnel creation.
 */
export interface CreateTunnelOptions {
  readonly dns?: boolean
}

/**
 * Filters for CLI tunnel listing.
 */
export interface ListTunnelOptions {
  readonly status?: string
}

/**
 * Options for CLI tunnel deletion.
 */
export interface DeleteTunnelOptions {
  readonly force?: boolean
}

/**
 * Options for running a tunnel from the CLI.
 */
export interface RunTunnelOptions {
  readonly logLevel?: "debug" | "info" | "warn" | "error"
}

/**
 * Tunnel log entry displayed by CLI commands.
 */
export interface TunnelLogEntry {
  readonly timestamp: string
  readonly level: string
  readonly message: string
}

/**
 * CLI service for named tunnel operations.
 */
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

/**
 * Service tag for named tunnel operations.
 */
export const TunnelApiService = ServiceMap.Service<TunnelApi>("tunnels-cli/TunnelApi")

// --- IngressService ---

/**
 * Ingress rule summary displayed by CLI commands.
 */
export interface IngressRuleInfo {
  readonly hostname: string
  readonly service: string
}

/**
 * CLI service for ingress rule operations.
 */
export interface Ingress {
  readonly add: (hostname: string, service: string) => Effect.Effect<void, CliError>
  readonly list: () => Effect.Effect<ReadonlyArray<IngressRuleInfo>, CliError>
  readonly remove: (hostname: string) => Effect.Effect<void, CliError>
}

/**
 * Service tag for ingress rule operations.
 */
export const IngressService = ServiceMap.Service<Ingress>("tunnels-cli/Ingress")

// --- RouteService ---

/**
 * Private route summary displayed by CLI commands.
 */
export interface RouteInfo {
  readonly network: string
  readonly tunnel: string
}

/**
 * CLI service for private route operations.
 */
export interface Route {
  readonly add: (network: string, tunnel: string) => Effect.Effect<void, CliError>
  readonly list: () => Effect.Effect<ReadonlyArray<RouteInfo>, CliError>
  readonly remove: (network: string) => Effect.Effect<void, CliError>
}

/**
 * Service tag for private route operations.
 */
export const RouteService = ServiceMap.Service<Route>("tunnels-cli/Route")

// --- DnsService ---

/**
 * DNS record summary displayed by CLI commands.
 */
export interface DnsRecordInfo {
  readonly hostname: string
  readonly tunnel: string
}

/**
 * CLI service for DNS record operations.
 */
export interface Dns {
  readonly create: (hostname: string, tunnel: string) => Effect.Effect<void, CliError>
  readonly list: () => Effect.Effect<ReadonlyArray<DnsRecordInfo>, CliError>
  readonly remove: (hostname: string) => Effect.Effect<void, CliError>
}

/**
 * Service tag for DNS record operations.
 */
export const DnsService = ServiceMap.Service<Dns>("tunnels-cli/Dns")

// --- VNetService ---

/**
 * Virtual network summary displayed by CLI commands.
 */
export interface VNetInfo {
  readonly name: string
  readonly isDefault: boolean
}

/**
 * Options for creating a virtual network from the CLI.
 */
export interface VNetCreateOptions {
  readonly isDefault?: boolean
}

/**
 * CLI service for virtual network operations.
 */
export interface VNet {
  readonly create: (name: string, opts?: VNetCreateOptions) => Effect.Effect<void, CliError>
  readonly list: () => Effect.Effect<ReadonlyArray<VNetInfo>, CliError>
  readonly delete: (name: string) => Effect.Effect<void, CliError>
}

/**
 * Service tag for virtual network operations.
 */
export const VNetService = ServiceMap.Service<VNet>("tunnels-cli/VNet")

// --- ConfigService ---

/**
 * Config validation result displayed by CLI commands.
 */
export interface ValidationResult {
  readonly valid: boolean
  readonly warnings: ReadonlyArray<string>
}

/**
 * Difference between local and remote tunnel configuration.
 */
export interface ConfigDiff {
  readonly added: ReadonlyArray<string>
  readonly removed: ReadonlyArray<string>
  readonly unchanged: ReadonlyArray<string>
}

/**
 * CLI service for configuration file operations.
 */
export interface Config {
  readonly validate: () => Effect.Effect<ValidationResult, CliError>
  readonly diff: () => Effect.Effect<ConfigDiff, CliError>
  readonly push: (opts?: { dryRun?: boolean }) => Effect.Effect<void, CliError>
  readonly pull: () => Effect.Effect<string, CliError>
  readonly init: () => Effect.Effect<string, CliError>
}

/**
 * Service tag for configuration file operations.
 */
export const ConfigService = ServiceMap.Service<Config>("tunnels-cli/Config")

// --- AuthService ---

/**
 * Authentication status displayed by CLI commands.
 */
export type AuthStatus =
  | { readonly authenticated: true; readonly email: string }
  | { readonly authenticated: false }

/**
 * CLI service for authentication operations.
 */
export interface Auth {
  readonly loginWithToken: (token: string) => Effect.Effect<void, CliError>
  readonly status: () => Effect.Effect<AuthStatus, CliError>
  readonly logout: () => Effect.Effect<void, CliError>
}

/**
 * Service tag for authentication operations.
 */
export const AuthService = ServiceMap.Service<Auth>("tunnels-cli/Auth")
