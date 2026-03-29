export interface CfTunnel {
  id: string
  name: string
  status: string
  created_at: string
  deleted_at: string | null
  remote_config: boolean
  connections: CfTunnelConnection[]
}

export interface CfTunnelConnection {
  id: string
  colo_name: string
  origin_ip: string
  opened_at: string
  client_version: string
  is_pending_reconnect: boolean
}

export interface CfTunnelConfig {
  config: {
    ingress: CfIngressRule[]
    "warp-routing"?: {
      enabled?: boolean
    }
    originRequest?: Record<string, unknown>
  }
}

export interface CfIngressRule {
  hostname?: string
  service: string
  path?: string
  originRequest?: Record<string, unknown>
}

export interface CfDnsRecord {
  id: string
  name: string
  type: string
  content: string
  proxied: boolean
  ttl: number
}

export interface CfZone {
  id: string
  name: string
  status: string
}

export interface CfRoute {
  id: string
  network: string
  tunnel_id: string
  tunnel_name?: string
  virtual_network_id?: string
  comment?: string
  created_at: string
  deleted_at: string | null
}

export interface CfVirtualNetwork {
  id: string
  name: string
  is_default_network: boolean
  comment?: string
  created_at: string
  deleted_at: string | null
}
