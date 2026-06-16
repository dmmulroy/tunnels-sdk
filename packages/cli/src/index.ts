// Public API
/**
 * Root CLI command.
 */
export { tunnels } from "./main.js"
/**
 * CLI error constructors and exit-code mapping.
 */
export { CliError, toExitCode } from "./errors.js"
/**
 * Output formatting helpers and context service.
 */
export { formatJson, formatTable, printData, OutputContext, defaultOutputContext, type Column, type OutputFormat } from "./output.js"
/**
 * Production CLI service layer.
 */
export { LiveLayer } from "./live-layer.js"
/**
 * CLI service tags and data contracts.
 */
export {
  type QuickTunnelResult,
  type QuickTunnel,
  QuickTunnelService,
  type TunnelInfo,
  type TunnelApi,
  TunnelApiService,
  type IngressRuleInfo,
  type Ingress,
  IngressService,
  type RouteInfo,
  type Route,
  RouteService,
  type DnsRecordInfo,
  type Dns,
  DnsService,
  type VNetInfo,
  type VNet,
  VNetService,
  type ValidationResult,
  type ConfigDiff,
  type Config,
  ConfigService,
  type AuthStatus,
  type Auth,
  AuthService,
} from "./services.js"
