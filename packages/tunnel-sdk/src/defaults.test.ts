import { describe, expect, it } from "vitest"
import { createMockApi } from "./test-utils.js"
import { createDefaultTunnelDeps } from "./defaults.js"

describe("createDefaultTunnelDeps", () => {
  it("returns deps with the cloudflared binary resolver", () => {
    const api = createMockApi()
    const deps = createDefaultTunnelDeps(api)

    expect(deps.api).toBe(api)
    expect(deps.binaryResolver).toBeDefined()
    expect(deps.binaryResolver!.path).toContain("cloudflared")
    expect(deps.processFactory).toBeDefined()
  })

  it("accepts an optional binaryPath override", () => {
    const api = createMockApi()
    const deps = createDefaultTunnelDeps(api, "/custom/cloudflared")

    expect(deps.binaryPath).toBe("/custom/cloudflared")
  })
})
