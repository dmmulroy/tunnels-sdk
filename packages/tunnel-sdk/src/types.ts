export type TunnelStatus = "healthy" | "inactive" | "degraded" | "down"

export interface TunnelConnection {
  id: string
  colo: string
  ip: string
  location: string
  openedAt: Date
  clientVersion: string
  isPendingReconnect: boolean
}

export interface IngressRule {
  hostname?: string
  service: string
  path?: string
  originRequest?: OriginRequestConfig
}

export interface OriginRequestConfig {
  connectTimeout?: string
  tlsTimeout?: string
  tcpKeepAlive?: string
  noHappyEyeballs?: boolean
  keepAliveConnections?: number
  keepAliveTimeout?: string
  httpHostHeader?: string
  originServerName?: string
  noTLSVerify?: boolean
  disableChunkedEncoding?: boolean
  proxyAddress?: string
  proxyPort?: number
  proxyType?: string
}

export interface TunnelClientOptions {
  accountId: string
  apiToken: string
  binaryPath?: string
  baseUrl?: string
  fetch?: typeof globalThis.fetch
}

export interface RunOptions {
  metrics?: string
  logLevel?: "debug" | "info" | "warn" | "error"
  gracePeriod?: string
  retries?: number
  signal?: AbortSignal
}

export interface DeleteOptions {
  force?: boolean
  cleanupDns?: boolean
}

export interface ExposeOptions {
  binaryPath?: string
}

export interface ConnectorInfo {
  id: string
  colo: string
  ip: string
  location: string
}

export interface ReconnectAttempt {
  number: number
  delay: number
  connector: ConnectorInfo
}

export interface TunnelError {
  code: string
  message: string
  retryable: boolean
  connector?: ConnectorInfo
}

export interface TunnelMetrics {
  rps: number
  p50Ms: number
  p99Ms: number
  activeConns: number
  bytesIn: number
  bytesOut: number
}

export interface LogEntry {
  timestamp: Date
  level: "info" | "warn" | "error" | "debug"
  event: string
  message: string
  connectorId?: string
  [key: string]: unknown
}

export interface TunnelProcessEvents {
  connected: (connector: ConnectorInfo) => void
  disconnected: (connector: ConnectorInfo) => void
  reconnecting: (attempt: ReconnectAttempt) => void
  error: (error: TunnelError) => void
  metrics: (metrics: TunnelMetrics) => void
  status: (status: TunnelStatus) => void
  exit: (code: number) => void
}

export interface DnsEnsureOptions {
  proxied?: boolean
  ttl?: number
}

export interface DnsRecord {
  hostname: string
  type: string
  content: string
}

export interface RouteAddOptions {
  vnet?: string
  comment?: string
}

export interface Route {
  network: string
  tunnelId: string
  tunnelName?: string
  vnet: string
  comment?: string
}

export interface RouteCheckResult {
  tunnel: string
  route: string
  vnet: string
}

export interface VNet {
  id: string
  name: string
  isDefault: boolean
  comment?: string
}

export interface VNetCreateOptions {
  default?: boolean
  comment?: string
}

export interface TunnelListOptions {
  status?: TunnelStatus
  /** Exact tunnel name filter */
  name?: string
  /** Alias for `name`. Filters by exact tunnel name (not fuzzy search). Cannot be combined with `name`. */
  search?: string
}
