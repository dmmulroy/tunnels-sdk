export { expose } from "./expose.js"
export { TunnelClient } from "./client.js"
export { TunnelConfig } from "./config/schema.js"

export type {
  // Core
  TunnelStatus,
  TunnelConnection,
  IngressRule,
  OriginRequestConfig,
  TunnelClientOptions,
  // Options
  RunOptions,
  DeleteOptions,
  ExposeOptions,
  TunnelListOptions,
  // Events
  ConnectorInfo,
  ReconnectAttempt,
  TunnelError,
  TunnelMetrics,
  TunnelProcessEvents,
  LogEntry,
  // DNS
  DnsEnsureOptions,
  DnsRecord,
  // Routes
  RouteAddOptions,
  Route,
  RouteCheckResult,
  // VNets
  VNet,
  VNetCreateOptions,
} from "./types.js"
