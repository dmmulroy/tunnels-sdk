import { beforeEach, describe, expect, it, vi } from "vitest"
import { createMockApi } from "./test-utils.js"
import { TunnelClient } from "./client.js"
import { TunnelSdkError } from "./errors.js"

describe("TunnelClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
  })

  it("rejects using name and search together", async () => {
    const client = new TunnelClient({
      accountId: "acct",
      apiToken: "token",
      baseUrl: "https://api.test.com/v4",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    })

    await expect(client.tunnels.list({ name: "a", search: "b" })).rejects.toThrow(TunnelSdkError)
  })

  it("uses search as a name filter alias", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, errors: [], messages: [], result: [] })),
    )

    const client = new TunnelClient({
      accountId: "acct",
      apiToken: "token",
      baseUrl: "https://api.test.com/v4",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    })

    await client.tunnels.list({ search: "prod" })

    const calledUrl = mockFetch.mock.calls[0][0] as string
    expect(calledUrl).toContain("name=prod")
    expect(calledUrl).toContain("is_deleted=false")
  })

  it("accepts an injected IApiClient, bypassing real HTTP", async () => {
    const api = createMockApi()
    api.get.mockResolvedValueOnce([])

    const client = new TunnelClient(
      { accountId: "acct", apiToken: "token" },
      { api },
    )

    const tunnels = await client.tunnels.list()
    expect(tunnels).toEqual([])
    expect(api.get).toHaveBeenCalledTimes(1)
  })

  it("creates tunnel via injected API and returns Tunnel with ingress/dns/routes", async () => {
    const api = createMockApi()
    api.post.mockResolvedValueOnce({
      id: "t-1",
      name: "my-tunnel",
      status: "inactive",
      created_at: "2025-02-18T10:00:00Z",
      deleted_at: null,
      remote_config: true,
      connections: [],
    })

    const client = new TunnelClient(
      { accountId: "acct", apiToken: "token" },
      { api },
    )

    const tunnel = await client.tunnels.create("my-tunnel")
    expect(tunnel.id).toBe("t-1")
    expect(tunnel.name).toBe("my-tunnel")
    expect(tunnel.ingress).toBeDefined()
    expect(tunnel.dns).toBeDefined()
    expect(tunnel.routes).toBeDefined()
  })

  it("exposes vnets manager via injected API", async () => {
    const api = createMockApi()
    api.get.mockResolvedValueOnce([
      { id: "v1", name: "prod", is_default_network: true, created_at: "2025-01-01", deleted_at: null },
    ])

    const client = new TunnelClient(
      { accountId: "acct", apiToken: "token" },
      { api },
    )

    const vnets = await client.vnets.list()
    expect(vnets).toHaveLength(1)
    expect(vnets[0].name).toBe("prod")
  })
})
