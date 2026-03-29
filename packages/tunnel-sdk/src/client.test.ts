import { beforeEach, describe, expect, it, vi } from "vitest"
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
})
