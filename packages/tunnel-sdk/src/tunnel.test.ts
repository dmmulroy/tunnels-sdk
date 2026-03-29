import { describe, expect, it, vi, beforeEach } from "vitest"
import { createMockApi, type MockApiClient } from "./test-utils.js"
import { Tunnel } from "./tunnel.js"
import type { BinaryResolver } from "./tunnel.js"

const baseTunnel = {
  id: "tunnel-123",
  name: "my-tunnel",
  status: "inactive",
  created_at: "2025-02-18T10:00:00Z",
  deleted_at: null,
  remote_config: true,
  connections: [],
}

function createBinaryResolver(overrides?: Partial<BinaryResolver>): BinaryResolver {
  return {
    path: "/managed/cloudflared",
    isInstalled: vi.fn().mockResolvedValue(true),
    install: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function createProcessFactory() {
  return {
    start: vi.fn().mockReturnValue({ kind: "process", stderr: null }),
  }
}

describe("Tunnel", () => {
  let api: MockApiClient
  let binaryResolver: ReturnType<typeof createBinaryResolver>
  let processFactory: ReturnType<typeof createProcessFactory>

  beforeEach(() => {
    api = createMockApi()
    binaryResolver = createBinaryResolver()
    processFactory = createProcessFactory()
  })

  it("caches tokens", async () => {
    api.get.mockResolvedValueOnce("token-123")
    const tunnel = new Tunnel(baseTunnel, {
      api: api,
      binaryResolver,
      processFactory,
    })

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

    const tunnel = new Tunnel(baseTunnel, { api: api, binaryResolver, processFactory })
    await tunnel.refresh()

    expect(tunnel.name).toBe("updated-name")
    expect(tunnel.status).toBe("healthy")
    expect(tunnel.connections).toHaveLength(1)
  })

  it("deletes DNS records before deleting the tunnel", async () => {
    const tunnel = new Tunnel(baseTunnel, { api: api, binaryResolver, processFactory })
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
    const tunnel = new Tunnel(baseTunnel, {
      api: api,
      binaryPath: "/custom/cloudflared",
      binaryResolver,
      processFactory,
    })

    await tunnel.run()

    expect(binaryResolver.isInstalled).not.toHaveBeenCalled()
    expect(binaryResolver.install).not.toHaveBeenCalled()
    expect(processFactory.start).toHaveBeenCalledWith("/custom/cloudflared", "token-123", undefined)
  })

  it("installs the managed binary when needed", async () => {
    api.get.mockResolvedValueOnce("token-123")
    binaryResolver = createBinaryResolver({
      isInstalled: vi.fn().mockResolvedValue(false),
    })

    const tunnel = new Tunnel(baseTunnel, { api: api, binaryResolver, processFactory })
    await tunnel.run({ logLevel: "info" })

    expect(binaryResolver.install).toHaveBeenCalled()
    expect(processFactory.start).toHaveBeenCalledWith(
      "/managed/cloudflared",
      "token-123",
      { logLevel: "info" },
    )
  })

  it("maps unknown API status values to 'inactive'", () => {
    const tunnel = new Tunnel({ ...baseTunnel, status: "pending" }, { api: api, binaryResolver, processFactory })
    expect(tunnel.status).toBe("inactive")
  })

  it("maps known API status values correctly", () => {
    for (const status of ["healthy", "inactive", "degraded", "down"] as const) {
      const tunnel = new Tunnel({ ...baseTunnel, status }, { api: api, binaryResolver, processFactory })
      expect(tunnel.status).toBe(status)
    }
  })

  it("logs() throws when no process is running", () => {
    const tunnel = new Tunnel(baseTunnel, { api: api, binaryResolver, processFactory })
    expect(() => tunnel.logs()).toThrow("No running tunnel process")
  })

  it("logs() returns a LogStream when a process is running", async () => {
    const { Readable } = await import("node:stream")
    const mockStderr = new Readable({ read() {} })
    processFactory.start.mockReturnValueOnce({ kind: "process", stderr: mockStderr } as any)

    api.get.mockResolvedValueOnce("token-123")
    const tunnel = new Tunnel(baseTunnel, { api: api, binaryResolver, processFactory })
    await tunnel.run()

    const stream = tunnel.logs()
    expect(stream).toBeDefined()
    expect(stream[Symbol.asyncIterator]).toBeDefined()
  })
})
