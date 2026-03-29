import { beforeEach, describe, expect, it, vi } from "vitest"
import { TunnelApiError, TunnelAuthError, TunnelSdkError } from "../errors.js"
import { ApiClient } from "./client.js"

function successResponse(result: unknown) {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result }))
}

function errorResponse(status: number, errors: Array<{ code: number; message: string }>) {
  return new Response(JSON.stringify({ success: false, errors, messages: [], result: null }), { status })
}

describe("ApiClient", () => {
  let client: ApiClient
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
    client = new ApiClient({
      accountId: "test-account-id",
      apiToken: "test-api-token",
      baseUrl: "https://api.test.com/v4",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    })
  })

  describe("constructor", () => {
    it("rejects empty accountId", () => {
      expect(() => new ApiClient({ accountId: "   ", apiToken: "token" })).toThrow(TunnelSdkError)
    })

    it("rejects empty apiToken", () => {
      expect(() => new ApiClient({ accountId: "acct", apiToken: "   " })).toThrow(TunnelSdkError)
    })
  })

  describe("get", () => {
    it("sends GET with auth headers using injected fetch", async () => {
      mockFetch.mockResolvedValueOnce(successResponse({ id: "123", name: "test" }))

      const result = await client.get<{ id: string; name: string }>("/test")

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/v4/test",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-token",
          }),
        }),
      )

      expect(result).toEqual({ id: "123", name: "test" })
    })

    it("passes query params", async () => {
      mockFetch.mockResolvedValueOnce(successResponse([]))

      await client.get("/test", { status: "healthy", name: "my-app" })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain("status=healthy")
      expect(calledUrl).toContain("name=my-app")
    })
  })

  describe("post", () => {
    it("sends POST with JSON body", async () => {
      mockFetch.mockResolvedValueOnce(successResponse({ id: "new-id" }))

      const result = await client.post<{ id: string }>("/tunnels", {
        name: "test-tunnel",
      })

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/v4/tunnels",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "test-tunnel" }),
        }),
      )

      expect(result).toEqual({ id: "new-id" })
    })
  })

  describe("delete", () => {
    it("passes query params", async () => {
      mockFetch.mockResolvedValueOnce(successResponse(null))

      await client.delete("/test", { cascade: "true" })

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain("cascade=true")
    })
  })

  describe("error handling", () => {
    it("throws TunnelAuthError on 401", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401, [{ code: 10000, message: "Invalid API token" }]))
      await expect(client.get("/test")).rejects.toThrow(TunnelAuthError)
    })

    it("throws TunnelApiError on other failures", async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404, [{ code: 1003, message: "Tunnel not found" }]))
      await expect(client.get("/test")).rejects.toThrow(TunnelApiError)
    })
  })

  describe("accountPath", () => {
    it("builds account-scoped paths", () => {
      expect(client.accountPath("/cfd_tunnel")).toBe("/accounts/test-account-id/cfd_tunnel")
    })
  })

  describe("zonePath", () => {
    it("builds zone-scoped paths", () => {
      expect(client.zonePath("zone-123", "/dns_records")).toBe("/zones/zone-123/dns_records")
    })
  })

  describe("paginate", () => {
    it("auto-paginates through pages", async () => {
      mockFetch
        .mockResolvedValueOnce(new Response(JSON.stringify({
          success: true, errors: [], messages: [],
          result: [{ id: "1" }, { id: "2" }],
          result_info: { page: 1, per_page: 2, total_pages: 2, count: 2, total_count: 3 },
        })))
        .mockResolvedValueOnce(new Response(JSON.stringify({
          success: true, errors: [], messages: [],
          result: [{ id: "3" }],
          result_info: { page: 2, per_page: 2, total_pages: 2, count: 1, total_count: 3 },
        })))

      const items: Array<{ id: string }> = []
      for await (const item of client.paginate<{ id: string }>("/test")) {
        items.push(item)
      }

      expect(items).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }])
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
