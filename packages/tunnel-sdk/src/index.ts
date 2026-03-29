export { TunnelClient } from "./client.js"
export { TunnelConfig } from "./config/schema.js"
export { Tunnel } from "./tunnel.js"
export type { TunnelDeps, ProcessFactory } from "./tunnel.js"
export { TunnelProcess } from "./process.js"
export { LogStream } from "./logs.js"
export { expose } from "./expose.js"

export type {
  TunnelStatus,
  TunnelConnection,
  IngressRule,
  OriginRequestConfig,
  TunnelClientOptions,
  RunOptions,
  DeleteOptions,
  ExposeOptions,
  ProcessSpawner,
  BinaryResolver,
  TunnelListOptions,
  ConnectorInfo,
  ReconnectAttempt,
  TunnelError,
  TunnelMetrics,
  TunnelProcessEvents,
  LogEntry,
  DnsEnsureOptions,
  DnsRecord,
  RouteAddOptions,
  Route,
  RouteCheckResult,
  VNet,
  VNetCreateOptions,
} from "./types.js"
