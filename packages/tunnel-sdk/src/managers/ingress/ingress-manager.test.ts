import { beforeEach, describe, expect, it } from "vitest"
import { createMockApi, type MockApiClient } from "../../test-utils.js"
import { IngressManager } from "./ingress-manager.js"

describe("IngressManager", () => {
  let api: MockApiClient

  beforeEach(() => {
    api = createMockApi()
  })

  it("adds rules before the catch-all and preserves existing config", async () => {
    const existingConfig = {
      config: {
        ingress: [{ hostname: "app.example.com", service: "http://localhost:3000" }, { service: "http_status:404" }],
        "warp-routing": { enabled: true },
      },
    }

    api.get
      .mockResolvedValueOnce(existingConfig)
      .mockResolvedValueOnce(existingConfig)

    const manager = new IngressManager(api, "tunnel-123")
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

    const manager = new IngressManager(api, "tunnel-123")
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

    const manager = new IngressManager(api, "tunnel-123")
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

    const manager = new IngressManager(api, "tunnel-123")
    await expect(manager.remove("nonexistent.example.com")).rejects.toThrow("No ingress rule found")
  })

  it("set() auto-appends catch-all if missing", async () => {
    api.get.mockResolvedValueOnce({ config: { ingress: [] } })

    const manager = new IngressManager(api, "tunnel-123")
    await manager.set([
      { hostname: "app.example.com", service: "http://localhost:3000" },
    ])

    const putCall = api.put.mock.calls[0][1] as any
    const ingress = putCall.config.ingress
    expect(ingress[ingress.length - 1]).toEqual({ service: "http_status:404" })
  })

  it("set() does not double-append catch-all if already present", async () => {
    api.get.mockResolvedValueOnce({ config: { ingress: [] } })

    const manager = new IngressManager(api, "tunnel-123")
    await manager.set([
      { hostname: "app.example.com", service: "http://localhost:3000" },
      { service: "http_status:404" },
    ])

    const putCall = api.put.mock.calls[0][1] as any
    const ingress = putCall.config.ingress
    expect(ingress).toHaveLength(2)
  })
})
