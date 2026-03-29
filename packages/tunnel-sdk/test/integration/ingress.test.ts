/**
 * Tier 2: Ingress management against real Cloudflare API.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { hasAuth, getTestEnv, createTestContext, type TestContext } from "../helpers/index.js"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("Ingress management (real API)", () => {
  let ctx: TestContext
  let tunnelId: string

  beforeAll(async () => {
    ctx = createTestContext(getTestEnv()!)
    // Create a tunnel to test ingress against
    const tunnel = await ctx.client.tunnels.create(ctx.name("ingress"))
    tunnelId = tunnel.id
    ctx.trackTunnel(tunnelId)
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  it("set → list roundtrip", async () => {
    const env = getTestEnv()!
    await ctx.client.ingress.set(tunnelId, [
      { hostname: `ing-test-a.${env.testZone}`, service: "http://localhost:3000" },
      { hostname: `ing-test-b.${env.testZone}`, service: "http://localhost:4000" },
      // catch-all gets auto-appended by IngressManager
    ])

    const rules = await ctx.client.ingress.list(tunnelId)
    const hostnames = rules.map((r) => r.hostname).filter(Boolean)
    expect(hostnames).toContain(`ing-test-a.${env.testZone}`)
    expect(hostnames).toContain(`ing-test-b.${env.testZone}`)

    // Last rule should be catch-all (no hostname)
    const lastRule = rules[rules.length - 1]
    expect(lastRule.hostname).toBeUndefined()
  })

  it("add inserts before catch-all", async () => {
    const env = getTestEnv()!
    await ctx.client.ingress.add(tunnelId, {
      hostname: `ing-test-c.${env.testZone}`,
      service: "http://localhost:5000",
    })

    const rules = await ctx.client.ingress.list(tunnelId)
    const hostnames = rules.map((r) => r.hostname).filter(Boolean)
    expect(hostnames).toContain(`ing-test-c.${env.testZone}`)

    // Catch-all still at end
    const lastRule = rules[rules.length - 1]
    expect(lastRule.hostname).toBeUndefined()
  })

  it("remove deletes a specific rule", async () => {
    const env = getTestEnv()!
    await ctx.client.ingress.remove(tunnelId, `ing-test-c.${env.testZone}`)

    const rules = await ctx.client.ingress.list(tunnelId)
    const hostnames = rules.map((r) => r.hostname).filter(Boolean)
    expect(hostnames).not.toContain(`ing-test-c.${env.testZone}`)
  })
})
