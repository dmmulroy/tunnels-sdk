import { beforeEach, describe, expect, it, vi } from "vitest"
import { TunnelApiError } from "../errors.js"
import { DnsManager } from "./dns.js"
import { IngressManager } from "./ingress.js"
import { RouteManager } from "./routes.js"
import { VNetManager } from "./vnets.js"

function createApi() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    paginate: vi.fn(),
    accountPath: vi.fn((path: string) => `/accounts/acct${path}`),
    zonePath: vi.fn((zoneId: string, path: string) => `/zones/${zoneId}${path}`),
  }
}

describe("IngressManager", () => {
  let api: ReturnType<typeof createApi>

  beforeEach(() => {
    api = createApi()
  })

  it("adds rules before the catch-all and preserves existing config", async () => {
    const existingConfig = {
      config: {
        ingress: [{ hostname: "app.example.com", service: "http://localhost:3000" }, { service: "http_status:404" }],
        "warp-routing": { enabled: true },
      },
    }

    // First get: list() reads current ingress. Second get: set() reads full config to preserve it.
    api.get
      .mockResolvedValueOnce(existingConfig)
      .mockResolvedValueOnce(existingConfig)

    const manager = new IngressManager(api as any, "tunnel-123")
    await manager.add({ hostname: "api.example.com", service: "http://localhost:8080" })

    expect(api.put).toHaveBeenCalledWith(
      "/accounts/acct/cfd_tunnel/tunnel-123/configurations",
      {
        config: {
          ingress: [
            { hostname: "app.example.com", service: "http://localhost:3000" },
            { hostname: "api.example.com", service: "http://localhost:8080" },
            { service: "http_status:404" },
          ],
          "warp-routing": { enabled: true },
        },
      },
    )
  })

  it("rejects duplicate hostnames on add", async () => {
    api.get.mockResolvedValueOnce({
      config: {
        ingress: [{ hostname: "app.example.com", service: "http://localhost:3000" }, { service: "http_status:404" }],
      },
    })

    const manager = new IngressManager(api as any, "tunnel-123")
    await expect(
      manager.add({ hostname: "app.example.com", service: "http://localhost:9090" }),
    ).rejects.toThrow("Duplicate hostname")
  })

  it("removes a rule by hostname", async () => {
    const existingConfig = {
      config: {
        ingress: [
          { hostname: "app.example.com", service: "http://localhost:3000" },
          { hostname: "api.example.com", service: "http://localhost:8080" },
          { service: "http_status:404" },
        ],
      },
    }

    api.get
      .mockResolvedValueOnce(existingConfig)
      .mockResolvedValueOnce(existingConfig)

    const manager = new IngressManager(api as any, "tunnel-123")
    await manager.remove("api.example.com")

    expect(api.put).toHaveBeenCalledWith(
      "/accounts/acct/cfd_tunnel/tunnel-123/configurations",
      {
        config: {
          ingress: [
            { hostname: "app.example.com", service: "http://localhost:3000" },
            { service: "http_status:404" },
          ],
        },
      },
    )
  })

  it("throws when removing a hostname that does not exist", async () => {
    api.get.mockResolvedValueOnce({
      config: {
        ingress: [{ hostname: "app.example.com", service: "http://localhost:3000" }, { service: "http_status:404" }],
      },
    })

    const manager = new IngressManager(api as any, "tunnel-123")
    await expect(manager.remove("nonexistent.example.com")).rejects.toThrow("No ingress rule found")
  })

  it("set() auto-appends catch-all if missing", async () => {
    api.get.mockResolvedValueOnce({ config: { ingress: [] } })

    const manager = new IngressManager(api as any, "tunnel-123")
    await manager.set([
      { hostname: "app.example.com", service: "http://localhost:3000" },
    ])

    const putCall = api.put.mock.calls[0][1] as any
    const ingress = putCall.config.ingress
    expect(ingress[ingress.length - 1]).toEqual({ service: "http_status:404" })
  })

  it("set() does not double-append catch-all if already present", async () => {
    api.get.mockResolvedValueOnce({ config: { ingress: [] } })

    const manager = new IngressManager(api as any, "tunnel-123")
    await manager.set([
      { hostname: "app.example.com", service: "http://localhost:3000" },
      { service: "http_status:404" },
    ])

    const putCall = api.put.mock.calls[0][1] as any
    const ingress = putCall.config.ingress
    expect(ingress).toHaveLength(2)
  })
})

describe("DnsManager", () => {
  let api: ReturnType<typeof createApi>

  beforeEach(() => {
    api = createApi()
  })

  it("updates an existing record that points elsewhere", async () => {
    api.get
      .mockResolvedValueOnce([{ id: "zone-1", name: "example.com", status: "active" }])
      .mockResolvedValueOnce([{ id: "record-1", name: "app.example.com", type: "CNAME", content: "wrong.example.com", proxied: true, ttl: 1 }])

    const manager = new DnsManager(api as any, "tunnel-123")
    await manager.ensure("app.example.com")

    expect(api.put).toHaveBeenCalledWith(
      "/zones/zone-1/dns_records/record-1",
      expect.objectContaining({
        content: "tunnel-123.cfargotunnel.com",
      }),
    )
  })

  it("creates a new record when none exists", async () => {
    api.get
      .mockResolvedValueOnce([{ id: "zone-1", name: "example.com", status: "active" }])
      .mockResolvedValueOnce([]) // no existing record

    const manager = new DnsManager(api as any, "tunnel-123")
    await manager.ensure("app.example.com")

    expect(api.post).toHaveBeenCalledWith(
      "/zones/zone-1/dns_records",
      expect.objectContaining({
        type: "CNAME",
        name: "app.example.com",
        content: "tunnel-123.cfargotunnel.com",
        proxied: true,
        ttl: 1,
      }),
    )
  })

  it("no-ops when existing record already points to correct target", async () => {
    api.get
      .mockResolvedValueOnce([{ id: "zone-1", name: "example.com", status: "active" }])
      .mockResolvedValueOnce([{
        id: "record-1",
        name: "app.example.com",
        type: "CNAME",
        content: "tunnel-123.cfargotunnel.com",
      }])

    const manager = new DnsManager(api as any, "tunnel-123")
    await manager.ensure("app.example.com")

    expect(api.put).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it("remove() deletes existing record", async () => {
    api.get
      .mockResolvedValueOnce([{ id: "zone-1", name: "example.com", status: "active" }])
      .mockResolvedValueOnce([{
        id: "record-1",
        name: "app.example.com",
        type: "CNAME",
        content: "tunnel-123.cfargotunnel.com",
      }])

    const manager = new DnsManager(api as any, "tunnel-123")
    await manager.remove("app.example.com")

    expect(api.delete).toHaveBeenCalledWith("/zones/zone-1/dns_records/record-1")
  })

  it("remove() is a no-op when record does not exist", async () => {
    api.get
      .mockResolvedValueOnce([{ id: "zone-1", name: "example.com", status: "active" }])
      .mockResolvedValueOnce([])

    const manager = new DnsManager(api as any, "tunnel-123")
    await manager.remove("app.example.com")

    expect(api.delete).not.toHaveBeenCalled()
  })

  it("throws when zone cannot be found", async () => {
    api.get.mockResolvedValue([]) // no zones found

    const manager = new DnsManager(api as any, "tunnel-123")
    await expect(manager.ensure("app.unknown-zone.com")).rejects.toThrow("Could not find Cloudflare zone")
  })

  it("caches zone lookups across calls", async () => {
    api.get
      // First ensure("app.example.com"):
      //   findZoneId tries "app.example.com" → no match, then "example.com" → match
      .mockResolvedValueOnce([])  // zones?name=app.example.com
      .mockResolvedValueOnce([{ id: "zone-1", name: "example.com", status: "active" }])  // zones?name=example.com
      .mockResolvedValueOnce([])  // dns_records for app.example.com (no existing)
      // Second ensure("api.example.com"):
      //   findZoneId tries "api.example.com" → no match, then "example.com" → CACHED (no API call)
      .mockResolvedValueOnce([])  // zones?name=api.example.com
      // "example.com" is cached — no get call needed
      .mockResolvedValueOnce([])  // dns_records for api.example.com (no existing)

    const manager = new DnsManager(api as any, "tunnel-123")
    await manager.ensure("app.example.com")
    await manager.ensure("api.example.com")

    // Zone lookup for "example.com" should happen once, not twice
    const exampleComCalls = api.get.mock.calls.filter(
      (call) => call[0] === "/zones" && call[1]?.name === "example.com",
    )
    expect(exampleComCalls).toHaveLength(1)
  })

  it("list() uses pagination", async () => {
    async function* mockPaginate() {
      yield { id: "zone-1", name: "example.com", status: "active" }
      yield { id: "zone-2", name: "other.com", status: "active" }
    }

    api.paginate.mockReturnValueOnce(mockPaginate())
    api.get
      .mockResolvedValueOnce([{ id: "r1", name: "app.example.com", type: "CNAME", content: "tunnel-123.cfargotunnel.com" }])
      .mockResolvedValueOnce([])

    const manager = new DnsManager(api as any, "tunnel-123")
    const records = await manager.list()

    expect(records).toHaveLength(1)
    expect(records[0].hostname).toBe("app.example.com")
    expect(api.paginate).toHaveBeenCalledWith("/zones")
  })
})

describe("RouteManager", () => {
  let api: ReturnType<typeof createApi>

  beforeEach(() => {
    api = createApi()
  })

  it("resolves vnet names when adding routes", async () => {
    api.get.mockResolvedValueOnce([{ id: "vnet-1", name: "production" }])

    const manager = new RouteManager(api as any, "tunnel-123")
    await manager.add("10.0.0.0/8", { vnet: "production", comment: "prod" })

    expect(api.post).toHaveBeenCalledWith(
      "/accounts/acct/teamnet/routes",
      {
        network: "10.0.0.0/8",
        tunnel_id: "tunnel-123",
        virtual_network_id: "vnet-1",
        comment: "prod",
      },
    )
  })

  it("adds route without vnet", async () => {
    const manager = new RouteManager(api as any, "tunnel-123")
    await manager.add("172.16.0.0/16")

    expect(api.post).toHaveBeenCalledWith(
      "/accounts/acct/teamnet/routes",
      {
        network: "172.16.0.0/16",
        tunnel_id: "tunnel-123",
      },
    )
  })

  it("throws when vnet name is not found", async () => {
    api.get.mockResolvedValueOnce([])

    const manager = new RouteManager(api as any, "tunnel-123")
    await expect(manager.add("10.0.0.0/8", { vnet: "nonexistent" })).rejects.toThrow(
      "Virtual network not found",
    )
  })

  it("removes a route", async () => {
    api.get.mockResolvedValueOnce([
      { id: "r1", network: "10.0.0.0/8", tunnel_id: "tunnel-123", is_deleted: false },
    ])

    const manager = new RouteManager(api as any, "tunnel-123")
    await manager.remove("10.0.0.0/8")

    expect(api.delete).toHaveBeenCalledWith(
      "/accounts/acct/teamnet/routes/10.0.0.0%2F8",
    )
  })

  it("throws when removing a non-existent route", async () => {
    api.get.mockResolvedValueOnce([])

    const manager = new RouteManager(api as any, "tunnel-123")
    await expect(manager.remove("10.0.0.0/8")).rejects.toThrow("No route found")
  })

  it("lists routes and maps fields", async () => {
    api.get.mockResolvedValueOnce([
      { id: "r1", network: "10.0.0.0/8", tunnel_id: "tunnel-123", tunnel_name: "my-app", virtual_network_id: "vnet-1", comment: "prod" },
    ])

    const manager = new RouteManager(api as any, "tunnel-123")
    const routes = await manager.list()

    expect(routes).toEqual([{
      network: "10.0.0.0/8",
      tunnelId: "tunnel-123",
      tunnelName: "my-app",
      vnet: "vnet-1",
      comment: "prod",
    }])
  })

  it("check() returns result for matching IP", async () => {
    api.get.mockResolvedValueOnce({
      tunnel_id: "tunnel-123",
      tunnel_name: "my-app",
      network: "10.0.0.0/8",
      virtual_network_id: "vnet-1",
    })

    const manager = new RouteManager(api as any, "tunnel-123")
    const result = await manager.check("10.1.2.3")

    expect(result).toEqual({
      tunnel: "my-app",
      route: "10.0.0.0/8",
      vnet: "vnet-1",
    })
  })

  it("check() returns null for 404 (no matching route)", async () => {
    api.get.mockRejectedValueOnce(new TunnelApiError(404, [{ code: 1003, message: "Not found" }]))

    const manager = new RouteManager(api as any, "tunnel-123")
    const result = await manager.check("192.168.1.1")

    expect(result).toBeNull()
  })

  it("check() propagates non-404 errors", async () => {
    api.get.mockRejectedValueOnce(new TunnelApiError(500, [{ code: 5000, message: "Internal error" }]))

    const manager = new RouteManager(api as any, "tunnel-123")
    await expect(manager.check("10.1.2.3")).rejects.toThrow(TunnelApiError)
  })
})

describe("VNetManager", () => {
  let api: ReturnType<typeof createApi>

  beforeEach(() => {
    api = createApi()
  })

  it("creates vnets and maps fields", async () => {
    api.post.mockResolvedValueOnce({
      id: "vnet-1",
      name: "production",
      is_default_network: true,
      comment: "main",
      created_at: "2025-02-18T10:00:00Z",
      deleted_at: null,
    })

    const manager = new VNetManager(api as any)
    const result = await manager.create("production", { default: true, comment: "main" })

    expect(result).toEqual({
      id: "vnet-1",
      name: "production",
      isDefault: true,
      comment: "main",
    })
  })

  it("lists vnets and maps fields", async () => {
    api.get.mockResolvedValueOnce([
      { id: "v1", name: "production", is_default_network: true, comment: "prod", created_at: "2025-01-01", deleted_at: null },
      { id: "v2", name: "staging", is_default_network: false, created_at: "2025-01-01", deleted_at: null },
    ])

    const manager = new VNetManager(api as any)
    const vnets = await manager.list()

    expect(vnets).toHaveLength(2)
    expect(vnets[0]).toEqual({ id: "v1", name: "production", isDefault: true, comment: "prod" })
    expect(vnets[1]).toEqual({ id: "v2", name: "staging", isDefault: false, comment: undefined })
  })

  it("deletes vnet by name", async () => {
    api.get.mockResolvedValueOnce([
      { id: "v1", name: "staging", is_default_network: false, created_at: "2025-01-01", deleted_at: null },
    ])

    const manager = new VNetManager(api as any)
    await manager.delete("staging")

    expect(api.delete).toHaveBeenCalledWith("/accounts/acct/teamnet/virtual_networks/v1")
  })

  it("throws when deleting a non-existent vnet", async () => {
    api.get.mockResolvedValueOnce([])

    const manager = new VNetManager(api as any)
    await expect(manager.delete("nonexistent")).rejects.toThrow("Virtual network not found")
  })
})
