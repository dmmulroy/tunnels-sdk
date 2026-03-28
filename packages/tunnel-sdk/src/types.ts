// ── Core Types ──────────────────────────────────────────────────────────────

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
  /** undefined = catch-all */
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

// ── Client Options ──────────────────────────────────────────────────────────

export interface TunnelClientOptions {
  accountId: string
  apiToken: string
  /** Override auto-managed binary path */
  binaryPath?: string
  /** Override API base URL (testing) */
  baseUrl?: string
}

// ── Run Options ─────────────────────────────────────────────────────────────

export interface RunOptions {
  /** Metrics server address (e.g., "localhost:12345") */
  metrics?: string
  /** Log level for cloudflared process */
  logLevel?: "debug" | "info" | "warn" | "error"
  /** Grace period for shutdown (default: "30s") */
  gracePeriod?: string
  /** Number of retries for connection (default: 5) */
  retries?: number
  /** AbortSignal for cancellation */
  signal?: AbortSignal
}

export interface DeleteOptions {
  /** Force delete even with active connections */
  force?: boolean
  /** Remove associated DNS records */
  cleanupDns?: boolean
}

// ── Expose Options ──────────────────────────────────────────────────────────

export interface ExposeOptions {
  /** Custom hostname (requires auth) */
  hostname?: string
  /** Protocol: http, https, tcp, ssh, rdp */
  protocol?: "http" | "https" | "tcp" | "ssh" | "rdp"
  /** API token (required for custom hostname) */
  apiToken?: string
  /** Account ID (required for custom hostname) */
  accountId?: string
  /** Override binary path */
  binaryPath?: string
}

// ── Event Types ─────────────────────────────────────────────────────────────

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

// ── DNS Types ───────────────────────────────────────────────────────────────

export interface DnsEnsureOptions {
  proxied?: boolean
  ttl?: number
}

export interface DnsRecord {
  hostname: string
  type: string
  content: string
}

// ── Route Types ─────────────────────────────────────────────────────────────

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

// ── VNet Types ──────────────────────────────────────────────────────────────

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

// ── List Options ────────────────────────────────────────────────────────────

export interface TunnelListOptions {
  status?: TunnelStatus
  name?: string
  search?: string
}
