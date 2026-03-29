import { beforeEach, describe, expect, it } from "vitest"
import { createMockApi, type MockApiClient } from "../../test-utils.js"
import { DnsManager } from "./dns-manager.js"

describe("DnsManager", () => {
  let api: MockApiClient

  beforeEach(() => {
    api = createMockApi()
  })

  it("updates an existing record that points elsewhere", async () => {
    api.get
      .mockResolvedValueOnce([{ id: "zone-1", name: "example.com", status: "active" }])
      .mockResolvedValueOnce([{ id: "record-1", name: "app.example.com", type: "CNAME", content: "wrong.example.com", proxied: true, ttl: 1 }])

    const manager = new DnsManager(api, "tunnel-123")
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
      .mockResolvedValueOnce([])

    const manager = new DnsManager(api, "tunnel-123")
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

    const manager = new DnsManager(api, "tunnel-123")
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

    const manager = new DnsManager(api, "tunnel-123")
    await manager.remove("app.example.com")

    expect(api.delete).toHaveBeenCalledWith("/zones/zone-1/dns_records/record-1")
  })

  it("remove() is a no-op when record does not exist", async () => {
    api.get
      .mockResolvedValueOnce([{ id: "zone-1", name: "example.com", status: "active" }])
      .mockResolvedValueOnce([])

    const manager = new DnsManager(api, "tunnel-123")
    await manager.remove("app.example.com")

    expect(api.delete).not.toHaveBeenCalled()
  })

  it("throws when zone cannot be found", async () => {
    api.get.mockResolvedValue([])

    const manager = new DnsManager(api, "tunnel-123")
    await expect(manager.ensure("app.unknown-zone.com")).rejects.toThrow("Could not find Cloudflare zone")
  })

  it("caches zone lookups across calls", async () => {
    api.get
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "zone-1", name: "example.com", status: "active" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const manager = new DnsManager(api, "tunnel-123")
    await manager.ensure("app.example.com")
    await manager.ensure("api.example.com")

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

    const manager = new DnsManager(api, "tunnel-123")
    const records = await manager.list()

    expect(records).toHaveLength(1)
    expect(records[0].hostname).toBe("app.example.com")
    expect(api.paginate).toHaveBeenCalledWith("/zones")
  })
})
