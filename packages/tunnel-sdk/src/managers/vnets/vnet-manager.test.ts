import { beforeEach, describe, expect, it } from "vitest"
import { createMockApi, type MockApiClient } from "../../test-utils.js"
import { VNetManager } from "./vnet-manager.js"

describe("VNetManager", () => {
  let api: MockApiClient

  beforeEach(() => {
    api = createMockApi()
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

    const manager = new VNetManager(api)
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

    const manager = new VNetManager(api)
    const vnets = await manager.list()

    expect(vnets).toHaveLength(2)
    expect(vnets[0]).toEqual({ id: "v1", name: "production", isDefault: true, comment: "prod" })
    expect(vnets[1]).toEqual({ id: "v2", name: "staging", isDefault: false, comment: undefined })
  })

  it("deletes vnet by name", async () => {
    api.get.mockResolvedValueOnce([
      { id: "v1", name: "staging", is_default_network: false, created_at: "2025-01-01", deleted_at: null },
    ])

    const manager = new VNetManager(api)
    await manager.delete("staging")

    expect(api.delete).toHaveBeenCalledWith("/accounts/acct/teamnet/virtual_networks/v1")
  })

  it("throws when deleting a non-existent vnet", async () => {
    api.get.mockResolvedValueOnce([])

    const manager = new VNetManager(api)
    await expect(manager.delete("nonexistent")).rejects.toThrow("Virtual network not found")
  })
})
