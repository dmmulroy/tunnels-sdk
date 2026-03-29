import { beforeEach, describe, expect, it } from "vitest"
import { TunnelApiError } from "../../errors.js"
import { createMockApi, type MockApiClient } from "../../test-utils.js"
import { RouteManager } from "./route-manager.js"

describe("RouteManager", () => {
  let api: MockApiClient

  beforeEach(() => {
    api = createMockApi()
  })

  it("resolves vnet names when adding routes", async () => {
    api.get.mockResolvedValueOnce([{ id: "vnet-1", name: "production" }])

    const manager = new RouteManager(api, "tunnel-123")
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
    const manager = new RouteManager(api, "tunnel-123")
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

    const manager = new RouteManager(api, "tunnel-123")
    await expect(manager.add("10.0.0.0/8", { vnet: "nonexistent" })).rejects.toThrow(
      "Virtual network not found",
    )
  })

  it("removes a route", async () => {
    api.get.mockResolvedValueOnce([
      { id: "r1", network: "10.0.0.0/8", tunnel_id: "tunnel-123", is_deleted: false },
    ])

    const manager = new RouteManager(api, "tunnel-123")
    await manager.remove("10.0.0.0/8")

    expect(api.delete).toHaveBeenCalledWith(
      "/accounts/acct/teamnet/routes/10.0.0.0%2F8",
    )
  })

  it("throws when removing a non-existent route", async () => {
    api.get.mockResolvedValueOnce([])

    const manager = new RouteManager(api, "tunnel-123")
    await expect(manager.remove("10.0.0.0/8")).rejects.toThrow("No route found")
  })

  it("lists routes and maps fields", async () => {
    api.get.mockResolvedValueOnce([
      { id: "r1", network: "10.0.0.0/8", tunnel_id: "tunnel-123", tunnel_name: "my-app", virtual_network_id: "vnet-1", comment: "prod" },
    ])

    const manager = new RouteManager(api, "tunnel-123")
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

    const manager = new RouteManager(api, "tunnel-123")
    const result = await manager.check("10.1.2.3")

    expect(result).toEqual({
      tunnel: "my-app",
      route: "10.0.0.0/8",
      vnet: "vnet-1",
    })
  })

  it("check() returns null for 404 (no matching route)", async () => {
    api.get.mockRejectedValueOnce(new TunnelApiError(404, [{ code: 1003, message: "Not found" }]))

    const manager = new RouteManager(api, "tunnel-123")
    const result = await manager.check("192.168.1.1")

    expect(result).toBeNull()
  })

  it("check() propagates non-404 errors", async () => {
    api.get.mockRejectedValueOnce(new TunnelApiError(500, [{ code: 5000, message: "Internal error" }]))

    const manager = new RouteManager(api, "tunnel-123")
    await expect(manager.check("10.1.2.3")).rejects.toThrow(TunnelApiError)
  })
})
