import { describe, expect, it, vi, beforeEach } from "vitest"
import { cloudflared } from "./bin/cloudflared.js"
import { Tunnel } from "./tunnel.js"
import { TunnelProcess } from "./process.js"

vi.mock("./bin/cloudflared.js", () => ({
  cloudflared: {
    path: "/managed/cloudflared",
    isInstalled: vi.fn().mockResolvedValue(true),
    install: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock("./process.js", () => ({
  TunnelProcess: {
    start: vi.fn().mockReturnValue({ kind: "process", stderr: null }),
  },
}))

const baseTunnel = {
  id: "tunnel-123",
  name: "my-tunnel",
  status: "inactive",
  created_at: "2025-02-18T10:00:00Z",
  deleted_at: null,
  remote_config: true,
  connections: [],
}

describe("Tunnel", () => {
  const api = {
    get: vi.fn(),
    delete: vi.fn(),
    accountPath: vi.fn((path: string) => `/accounts/acct${path}`),
    zonePath: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("caches tokens", async () => {
    api.get.mockResolvedValueOnce("token-123")
    const tunnel = new Tunnel(baseTunnel, api as any)

    await expect(tunnel.getToken()).resolves.toBe("token-123")
    await expect(tunnel.getToken()).resolves.toBe("token-123")
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it("refreshes snapshot properties from the API", async () => {
    api.get.mockResolvedValueOnce({
      ...baseTunnel,
      name: "updated-name",
      status: "healthy",
      connections: [{
        id: "conn-1",
        colo_name: "iad01",
        origin_ip: "127.0.0.1",
        opened_at: "2025-02-18T10:00:00Z",
        client_version: "1.0.0",
        is_pending_reconnect: false,
      }],
    })

    const tunnel = new Tunnel(baseTunnel, api as any)
    await tunnel.refresh()

    expect(tunnel.name).toBe("updated-name")
    expect(tunnel.status).toBe("healthy")
    expect(tunnel.connections).toHaveLength(1)
  })

  it("deletes DNS records before deleting the tunnel", async () => {
    const tunnel = new Tunnel(baseTunnel, api as any)
    const order: string[] = []

    vi.spyOn(tunnel.dns, "list").mockImplementation(async () => {
      order.push("list")
      return [{ hostname: "app.example.com", type: "CNAME", content: "target" }]
    })
    vi.spyOn(tunnel.dns, "remove").mockImplementation(async () => {
      order.push("remove")
    })
    api.delete.mockImplementation(async () => {
      order.push("delete")
    })

    await tunnel.delete({ cleanupDns: true, force: true })

    expect(order).toEqual(["list", "remove", "delete"])
    expect(api.delete).toHaveBeenCalledWith(
      "/accounts/acct/cfd_tunnel/tunnel-123",
      { cascade: "true" },
    )
  })

  it("uses a custom binary path without checking managed install state", async () => {
    api.get.mockResolvedValueOnce("token-123")
    const tunnel = new Tunnel(baseTunnel, api as any, "/custom/cloudflared")

    await tunnel.run()

    expect(cloudflared.isInstalled).not.toHaveBeenCalled()
    expect(cloudflared.install).not.toHaveBeenCalled()
    expect(TunnelProcess.start).toHaveBeenCalledWith("/custom/cloudflared", "token-123", undefined)
  })

  it("installs the managed binary when needed", async () => {
    api.get.mockResolvedValueOnce("token-123")
    vi.mocked(cloudflared.isInstalled).mockResolvedValueOnce(false)

    const tunnel = new Tunnel(baseTunnel, api as any)
    await tunnel.run({ logLevel: "info" })

    expect(cloudflared.install).toHaveBeenCalled()
    expect(TunnelProcess.start).toHaveBeenCalledWith(
      "/managed/cloudflared",
      "token-123",
      { logLevel: "info" },
    )
  })

  it("maps unknown API status values to 'inactive'", () => {
    const tunnel = new Tunnel({ ...baseTunnel, status: "pending" }, api as any)
    expect(tunnel.status).toBe("inactive")
  })

  it("maps known API status values correctly", () => {
    for (const status of ["healthy", "inactive", "degraded", "down"] as const) {
      const tunnel = new Tunnel({ ...baseTunnel, status }, api as any)
      expect(tunnel.status).toBe(status)
    }
  })

  it("logs() throws when no process is running", () => {
    const tunnel = new Tunnel(baseTunnel, api as any)
    expect(() => tunnel.logs()).toThrow("No running tunnel process")
  })

  it("logs() returns a LogStream when a process is running", async () => {
    const { Readable } = await import("node:stream")
    const mockStderr = new Readable({ read() {} })
    vi.mocked(TunnelProcess.start).mockReturnValueOnce({ kind: "process", stderr: mockStderr } as any)

    api.get.mockResolvedValueOnce("token-123")
    const tunnel = new Tunnel(baseTunnel, api as any)
    await tunnel.run()

    const stream = tunnel.logs()
    expect(stream).toBeDefined()
    expect(stream[Symbol.asyncIterator]).toBeDefined()
  })
})
