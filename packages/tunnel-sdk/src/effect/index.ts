// ─── Errors ───
export {
  TunnelSdkError,
  TunnelApiError,
  TunnelAuthError,
  TunnelNotFoundError,
  TunnelProcessError,
  BinaryInstallError,
  ConfigValidationError,
} from "./errors.js"

// ─── Schemas / Domain types ───
export {
  TunnelInfo,
  TunnelConnection,
  TunnelStatus,
  IngressRule,
  Route,
  RouteCheckResult,
  DnsRecord,
  VNet,
  ConnectorInfo,
  TunnelMetrics,
  LogEntry,
  LogLevel,
} from "./schemas.js"

// ─── Cloudflare wire types ───
export {
  CfTunnel,
  CfTunnelConnection,
  CfDnsRecord,
  CfZone,
  CfRoute,
  CfVirtualNetwork,
  CfIngressRule,
  CfTunnelConfig,
} from "./schemas.js"

// ─── Services ───
export { CloudflareApi, CloudflareApiConfig } from "./services/CloudflareApi.js"
export { TunnelOperations } from "./services/TunnelOperations.js"
export type {
  CreateTunnelOptions,
  TunnelListOptions,
  DeleteOptions,
} from "./services/TunnelOperations.js"
export { IngressManager } from "./services/IngressManager.js"
export { DnsManager } from "./services/DnsManager.js"
export { RouteManager } from "./services/RouteManager.js"
export { VNetManager } from "./services/VNetManager.js"
export { CloudflaredBinary } from "./services/CloudflaredBinary.js"
export { TunnelProcessService } from "./services/TunnelProcess.js"
export type {
  RunningTunnel,
  TunnelEvent,
  RunOptions,
  ReconnectAttempt,
} from "./services/TunnelProcess.js"

// ─── Stderr parsing ───
export { processStderr, applyEvents, parseLine, toEvent } from "./services/parse-stderr.js"
export type { StderrStreams } from "./services/parse-stderr.js"

// ─── Top-level Effects ───
export { expose } from "./expose.js"

// ─── Config ───
export {
  parseConfig,
  parseConfigFromYaml,
  parseConfigFromFile,
} from "./config.js"

// ─── Layers ───
export { LiveLayer } from "./layers/Live.js"
export { TestLayer } from "./layers/Test.js"
