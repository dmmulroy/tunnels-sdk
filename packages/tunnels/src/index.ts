// ---------------------------------------------------------------------------
// New Effect-backed async/await wrapper API
// ---------------------------------------------------------------------------

export { TunnelClient, expose } from "./wrapper.js"
export type { TunnelClientOptions, ExposedTunnel } from "./wrapper.js"

// Re-export types from Effect SDK (no Effect knowledge required for consumers)
export type {
  TunnelInfo,
  IngressRule,
  Route,
  DnsRecord,
  VNet,
  RouteCheckResult,
  RunningTunnel,
  TunnelEvent,
  RunOptions,
  CreateTunnelOptions,
  TunnelListOptions,
  DeleteOptions,
  TunnelStatus,
  ConnectorInfo,
  LogEntry,
} from "./effect/index.js"

// Config validation
export { parseConfig, parseConfigFromYaml, parseConfigFromFile } from "./effect/config.js"
