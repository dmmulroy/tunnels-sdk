import { describe, expect, it, vi } from "vitest"
import type { IApiClient } from "./interfaces.js"
import { ApiClient } from "./client.js"

describe("IApiClient", () => {
  it("ApiClient satisfies the IApiClient interface", () => {
    const client = new ApiClient({
      accountId: "acct",
      apiToken: "token",
      baseUrl: "https://api.test.com/v4",
      fetch: vi.fn(),
    })

    // Assignment must compile — proves ApiClient implements IApiClient
    const asInterface: IApiClient = client
    expect(asInterface).toBe(client)
  })

  it("a plain object can satisfy IApiClient for testing", () => {
    const mock: IApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      paginate: vi.fn(),
      accountPath: vi.fn((path: string) => `/accounts/acct${path}`),
      zonePath: vi.fn((zoneId: string, path: string) => `/zones/${zoneId}${path}`),
    }

    expect(mock.accountPath("/cfd_tunnel")).toBe("/accounts/acct/cfd_tunnel")
    expect(mock.zonePath("zone-1", "/dns_records")).toBe("/zones/zone-1/dns_records")
  })
})
