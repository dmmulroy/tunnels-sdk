import { describe, it, assert } from "@effect/vitest"
import { Schema } from "effect"
import {
  CfTunnel,
  CfTunnelConnection,
  CfDnsRecord,
  CfZone,
  CfRoute,
  CfVirtualNetwork,
  CfIngressRule,
  CfTunnelConfig,
  TunnelStatus,
  TunnelInfo,
  TunnelConnection,
  IngressRule,
  Route,
  RouteCheckResult,
  DnsRecord,
  VNet,
  ConnectorInfo,
  TunnelMetrics,
  LogEntry,
} from "./schemas.js"

describe("Cloudflare wire type schemas", () => {
  describe("CfTunnelConnection", () => {
    it("decodes a valid connection", () => {
      const data = {
        id: "conn-1",
        colo_name: "DFW",
        origin_ip: "1.2.3.4",
        opened_at: "2024-01-01T00:00:00Z",
        client_version: "2024.1.0",
        is_pending_reconnect: false,
      }
      const result = Schema.decodeUnknownSync(CfTunnelConnection)(data)
      assert.strictEqual(result.id, "conn-1")
      assert.strictEqual(result.colo_name, "DFW")
      assert.strictEqual(result.is_pending_reconnect, false)
    })
  })

  describe("CfTunnel", () => {
    it("decodes a valid tunnel", () => {
      const data = {
        id: "tunnel-1",
        name: "my-tunnel",
        status: "healthy",
        created_at: "2024-01-01T00:00:00Z",
        deleted_at: null,
        remote_config: true,
        connections: [
          {
            id: "conn-1",
            colo_name: "DFW",
            origin_ip: "1.2.3.4",
            opened_at: "2024-01-01T00:00:00Z",
            client_version: "2024.1.0",
            is_pending_reconnect: false,
          },
        ],
      }
      const result = Schema.decodeUnknownSync(CfTunnel)(data)
      assert.strictEqual(result.id, "tunnel-1")
      assert.strictEqual(result.name, "my-tunnel")
      assert.strictEqual(result.connections.length, 1)
    })

    it("rejects missing required fields", () => {
      const data = { id: "tunnel-1" }
      assert.throws(() => Schema.decodeUnknownSync(CfTunnel)(data))
    })
  })

  describe("CfDnsRecord", () => {
    it("decodes a valid record", () => {
      const data = {
        id: "dns-1",
        name: "app.example.com",
        type: "CNAME",
        content: "tunnel-id.cfargotunnel.com",
        proxied: true,
        ttl: 1,
      }
      const result = Schema.decodeUnknownSync(CfDnsRecord)(data)
      assert.strictEqual(result.name, "app.example.com")
      assert.strictEqual(result.proxied, true)
    })
  })

  describe("CfZone", () => {
    it("decodes a valid zone", () => {
      const data = { id: "zone-1", name: "example.com", status: "active" }
      const result = Schema.decodeUnknownSync(CfZone)(data)
      assert.strictEqual(result.name, "example.com")
    })
  })

  describe("CfRoute", () => {
    it("decodes a valid route with optional fields", () => {
      const data = {
        id: "route-1",
        network: "10.0.0.0/8",
        tunnel_id: "tunnel-1",
        tunnel_name: "my-tunnel",
        virtual_network_id: "vnet-1",
        comment: "main route",
        created_at: "2024-01-01T00:00:00Z",
        deleted_at: null,
      }
      const result = Schema.decodeUnknownSync(CfRoute)(data)
      assert.strictEqual(result.network, "10.0.0.0/8")
      assert.strictEqual(result.tunnel_name, "my-tunnel")
    })
  })

  describe("CfVirtualNetwork", () => {
    it("decodes a valid vnet", () => {
      const data = {
        id: "vnet-1",
        name: "default",
        is_default_network: true,
        comment: "default network",
        created_at: "2024-01-01T00:00:00Z",
        deleted_at: null,
      }
      const result = Schema.decodeUnknownSync(CfVirtualNetwork)(data)
      assert.strictEqual(result.is_default_network, true)
    })
  })

  describe("CfIngressRule", () => {
    it("decodes a catch-all rule", () => {
      const data = { service: "http://localhost:3000" }
      const result = Schema.decodeUnknownSync(CfIngressRule)(data)
      assert.strictEqual(result.service, "http://localhost:3000")
      assert.strictEqual(result.hostname, undefined)
    })

    it("decodes a rule with hostname", () => {
      const data = {
        hostname: "app.example.com",
        service: "http://localhost:8080",
      }
      const result = Schema.decodeUnknownSync(CfIngressRule)(data)
      assert.strictEqual(result.hostname, "app.example.com")
    })
  })

  describe("CfTunnelConfig", () => {
    it("decodes a valid tunnel config", () => {
      const data = {
        config: {
          ingress: [
            { hostname: "app.example.com", service: "http://localhost:8080" },
            { service: "http_status:404" },
          ],
        },
      }
      const result = Schema.decodeUnknownSync(CfTunnelConfig)(data)
      assert.strictEqual(result.config.ingress.length, 2)
    })
  })
})

describe("SDK domain type schemas", () => {
  describe("TunnelStatus", () => {
    it("accepts valid statuses", () => {
      for (const status of ["healthy", "inactive", "degraded", "down"]) {
        const result = Schema.decodeUnknownSync(TunnelStatus)(status)
        assert.strictEqual(result, status)
      }
    })

    it("rejects invalid status", () => {
      assert.throws(() => Schema.decodeUnknownSync(TunnelStatus)("unknown"))
    })
  })

  describe("TunnelConnection", () => {
    it("creates a valid connection", () => {
      const conn = new TunnelConnection({
        id: "conn-1",
        colo: "DFW",
        ip: "1.2.3.4",
        location: "Dallas",
        openedAt: "2024-01-01T00:00:00Z",
        clientVersion: "2024.1.0",
        isPendingReconnect: false,
      })
      assert.strictEqual(conn.id, "conn-1")
      assert.strictEqual(conn.colo, "DFW")
    })
  })

  describe("TunnelInfo", () => {
    it("creates a valid tunnel info", () => {
      const info = new TunnelInfo({
        id: "tunnel-1",
        name: "my-tunnel",
        status: "healthy",
        createdAt: "2024-01-01T00:00:00Z",
        deletedAt: null,
        connections: [],
        remoteConfig: true,
      })
      assert.strictEqual(info.id, "tunnel-1")
      assert.strictEqual(info.status, "healthy")
    })
  })

  describe("IngressRule", () => {
    it("creates a rule with optional fields", () => {
      const rule = new IngressRule({
        service: "http://localhost:3000",
      })
      assert.strictEqual(rule.service, "http://localhost:3000")
      assert.strictEqual(rule.hostname, undefined)
    })
  })

  describe("Route", () => {
    it("creates a route", () => {
      const route = new Route({
        network: "10.0.0.0/8",
        tunnelId: "tunnel-1",
        vnet: "default",
      })
      assert.strictEqual(route.network, "10.0.0.0/8")
    })
  })

  describe("DnsRecord", () => {
    it("creates a dns record", () => {
      const record = new DnsRecord({
        hostname: "app.example.com",
        type: "CNAME",
        content: "tunnel.cfargotunnel.com",
      })
      assert.strictEqual(record.hostname, "app.example.com")
    })
  })

  describe("VNet", () => {
    it("creates a vnet", () => {
      const vnet = new VNet({
        id: "vnet-1",
        name: "default",
        isDefault: true,
      })
      assert.strictEqual(vnet.isDefault, true)
    })
  })

  describe("ConnectorInfo", () => {
    it("creates connector info", () => {
      const info = new ConnectorInfo({
        id: "conn-1",
        colo: "DFW",
        ip: "1.2.3.4",
        location: "Dallas",
      })
      assert.strictEqual(info.colo, "DFW")
    })
  })

  describe("TunnelMetrics", () => {
    it("creates metrics", () => {
      const metrics = new TunnelMetrics({
        rps: 100,
        p50Ms: 10,
        p99Ms: 50,
        activeConns: 4,
        bytesIn: 1024,
        bytesOut: 2048,
      })
      assert.strictEqual(metrics.rps, 100)
      assert.strictEqual(metrics.activeConns, 4)
    })
  })

  describe("LogEntry", () => {
    it("creates a log entry", () => {
      const entry = new LogEntry({
        timestamp: new Date("2024-01-01T00:00:00Z"),
        level: "info",
        event: "tunnel.connected",
        message: "Connected",
      })
      assert.strictEqual(entry.level, "info")
      assert.strictEqual(entry.connectorId, undefined)
    })
  })

  describe("RouteCheckResult", () => {
    it("creates a route check result", () => {
      const result = new RouteCheckResult({
        tunnel: "my-tunnel",
        route: "10.0.0.0/8",
        vnet: "default",
      })
      assert.strictEqual(result.tunnel, "my-tunnel")
    })
  })
})
