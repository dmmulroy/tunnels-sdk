import { Schema } from "effect"

// ---------------------------------------------------------------------------
// Cloudflare API wire types (snake_case, match CF API JSON)
// ---------------------------------------------------------------------------

export class CfTunnelConnection extends Schema.Class<CfTunnelConnection>("CfTunnelConnection")({
  id: Schema.String,
  colo_name: Schema.String,
  origin_ip: Schema.String,
  opened_at: Schema.String,
  client_version: Schema.String,
  is_pending_reconnect: Schema.Boolean,
}) {}

export class CfTunnel extends Schema.Class<CfTunnel>("CfTunnel")({
  id: Schema.String,
  name: Schema.String,
  status: Schema.String,
  created_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
  remote_config: Schema.Boolean,
  connections: Schema.Array(CfTunnelConnection),
}) {}

export class CfDnsRecord extends Schema.Class<CfDnsRecord>("CfDnsRecord")({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  content: Schema.String,
  proxied: Schema.Boolean,
  ttl: Schema.Number,
}) {}

export class CfZone extends Schema.Class<CfZone>("CfZone")({
  id: Schema.String,
  name: Schema.String,
  status: Schema.String,
}) {}

export class CfRoute extends Schema.Class<CfRoute>("CfRoute")({
  id: Schema.String,
  network: Schema.String,
  tunnel_id: Schema.String,
  tunnel_name: Schema.optional(Schema.String),
  virtual_network_id: Schema.optional(Schema.String),
  comment: Schema.optional(Schema.String),
  created_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
}) {}

export class CfVirtualNetwork extends Schema.Class<CfVirtualNetwork>("CfVirtualNetwork")({
  id: Schema.String,
  name: Schema.String,
  is_default_network: Schema.Boolean,
  comment: Schema.optional(Schema.String),
  created_at: Schema.String,
  deleted_at: Schema.NullOr(Schema.String),
}) {}

export class CfIngressRule extends Schema.Class<CfIngressRule>("CfIngressRule")({
  hostname: Schema.optional(Schema.String),
  service: Schema.String,
  path: Schema.optional(Schema.String),
  originRequest: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
}) {}

export class CfTunnelConfig extends Schema.Class<CfTunnelConfig>("CfTunnelConfig")({
  config: Schema.Struct({
    ingress: Schema.Array(CfIngressRule),
    "warp-routing": Schema.optional(
      Schema.Struct({ enabled: Schema.optional(Schema.Boolean) })
    ),
    originRequest: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  }),
}) {}

// ---------------------------------------------------------------------------
// SDK domain types (camelCase, public-facing)
// ---------------------------------------------------------------------------

export const TunnelStatus = Schema.Union([
  Schema.Literal("healthy"),
  Schema.Literal("inactive"),
  Schema.Literal("degraded"),
  Schema.Literal("down"),
])
export type TunnelStatus = typeof TunnelStatus.Type

export class TunnelConnection extends Schema.Class<TunnelConnection>("TunnelConnection")({
  id: Schema.String,
  colo: Schema.String,
  ip: Schema.String,
  location: Schema.String,
  openedAt: Schema.String,
  clientVersion: Schema.String,
  isPendingReconnect: Schema.Boolean,
}) {}

export class TunnelInfo extends Schema.Class<TunnelInfo>("TunnelInfo")({
  id: Schema.String,
  name: Schema.String,
  status: TunnelStatus,
  createdAt: Schema.String,
  deletedAt: Schema.NullOr(Schema.String),
  connections: Schema.Array(TunnelConnection),
  remoteConfig: Schema.Boolean,
}) {}

export class IngressRule extends Schema.Class<IngressRule>("IngressRule")({
  hostname: Schema.optional(Schema.String),
  service: Schema.String,
  path: Schema.optional(Schema.String),
  originRequest: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
}) {}

export class Route extends Schema.Class<Route>("Route")({
  network: Schema.String,
  tunnelId: Schema.String,
  tunnelName: Schema.optional(Schema.String),
  vnet: Schema.String,
  comment: Schema.optional(Schema.String),
}) {}

export class RouteCheckResult extends Schema.Class<RouteCheckResult>("RouteCheckResult")({
  tunnel: Schema.String,
  route: Schema.String,
  vnet: Schema.String,
}) {}

export class DnsRecord extends Schema.Class<DnsRecord>("DnsRecord")({
  hostname: Schema.String,
  type: Schema.String,
  content: Schema.String,
}) {}

export class VNet extends Schema.Class<VNet>("VNet")({
  id: Schema.String,
  name: Schema.String,
  isDefault: Schema.Boolean,
  comment: Schema.optional(Schema.String),
}) {}

export class ConnectorInfo extends Schema.Class<ConnectorInfo>("ConnectorInfo")({
  id: Schema.String,
  colo: Schema.String,
  ip: Schema.String,
  location: Schema.String,
}) {}

export class TunnelMetrics extends Schema.Class<TunnelMetrics>("TunnelMetrics")({
  rps: Schema.Number,
  p50Ms: Schema.Number,
  p99Ms: Schema.Number,
  activeConns: Schema.Number,
  bytesIn: Schema.Number,
  bytesOut: Schema.Number,
}) {}

export const LogLevel = Schema.Union([
  Schema.Literal("info"),
  Schema.Literal("warn"),
  Schema.Literal("error"),
  Schema.Literal("debug"),
])
export type LogLevel = typeof LogLevel.Type

export class LogEntry extends Schema.Class<LogEntry>("LogEntry")({
  timestamp: Schema.Date,
  level: LogLevel,
  event: Schema.String,
  message: Schema.String,
  connectorId: Schema.optional(Schema.String),
}) {}
