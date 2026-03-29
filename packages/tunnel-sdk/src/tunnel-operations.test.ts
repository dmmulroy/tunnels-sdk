import { describe, expect, it, beforeEach } from "vitest"
import { createMockApi, type MockApiClient } from "./test-utils.js"
import { TunnelOperations } from "./tunnel-operations.js"

const baseCfTunnel = {
  id: "t-1",
  name: "my-tunnel",
  status: "inactive",
  created_at: "2025-02-18T10:00:00Z",
  deleted_at: null,
  remote_config: true,
  connections: [],
}

describe("TunnelOperations", () => {
  let api: MockApiClient

  beforeEach(() => {
    api = createMockApi()
  })

  it("create() calls API and returns a Tunnel", async () => {
    api.post.mockResolvedValueOnce(baseCfTunnel)
    const ops = new TunnelOperations(api)

    const tunnel = await ops.create("my-tunnel")
    expect(tunnel.id).toBe("t-1")
    expect(tunnel.name).toBe("my-tunnel")
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it("create() sets ingress when provided", async () => {
    api.post.mockResolvedValueOnce(baseCfTunnel)
    // ingress.set reads config then puts
    api.get.mockResolvedValueOnce({ config: { ingress: [] } })
    api.put.mockResolvedValueOnce(undefined)

    const ops = new TunnelOperations(api)
    await ops.create("my-tunnel", {
      ingress: [{ hostname: "app.example.com", service: "http://localhost:3000" }],
    })

    expect(api.put).toHaveBeenCalledTimes(1)
  })

  it("create() ensures DNS when auto is true", async () => {
    api.post.mockResolvedValueOnce(baseCfTunnel)
    // ingress.set
    api.get
      .mockResolvedValueOnce({ config: { ingress: [] } })
    api.put.mockResolvedValueOnce(undefined)
    // dns.ensure → findZoneId → findRecord → create
    api.get
      .mockResolvedValueOnce([{ id: "zone-1", name: "example.com", status: "active" }])
      .mockResolvedValueOnce([])
    api.post.mockResolvedValueOnce(undefined)

    const ops = new TunnelOperations(api)
    await ops.create("my-tunnel", {
      ingress: [{ hostname: "app.example.com", service: "http://localhost:3000" }],
      dns: { auto: true },
    })

    // post called twice: tunnel create + dns record create
    expect(api.post).toHaveBeenCalledTimes(2)
  })

  it("list() returns Tunnel instances", async () => {
    api.get.mockResolvedValueOnce([baseCfTunnel])

    const ops = new TunnelOperations(api)
    const tunnels = await ops.list()

    expect(tunnels).toHaveLength(1)
    expect(tunnels[0].name).toBe("my-tunnel")
  })

  it("get() finds tunnel by UUID", async () => {
    const uuidTunnel = { ...baseCfTunnel, id: "12345678-1234-1234-1234-123456789012" }
    api.get.mockResolvedValueOnce(uuidTunnel)

    const ops = new TunnelOperations(api)
    const tunnel = await ops.get("12345678-1234-1234-1234-123456789012")

    expect(tunnel.id).toBe("12345678-1234-1234-1234-123456789012")
  })

  it("get() finds tunnel by name", async () => {
    api.get.mockResolvedValueOnce([baseCfTunnel])

    const ops = new TunnelOperations(api)
    const tunnel = await ops.get("my-tunnel")

    expect(tunnel.name).toBe("my-tunnel")
  })
})
