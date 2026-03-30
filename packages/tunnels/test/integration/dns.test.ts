/**
 * Tier 2: DNS management against real Cloudflare API.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { hasAuth, getTestEnv, createTestContext, type TestContext } from "../helpers/index.js"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("DNS management (real API)", () => {
  let ctx: TestContext
  let tunnelId: string
  let hostname: string

  beforeAll(async () => {
    ctx = createTestContext(getTestEnv()!)
    const env = getTestEnv()!
    const tunnel = await ctx.client.tunnels.create(ctx.name("dns"))
    tunnelId = tunnel.id
    ctx.trackTunnel(tunnelId)
    hostname = `tunnels-dns-test-${Date.now()}.${env.testZone}`
  })

  afterAll(async () => {
    // DNS cleanup is tracked, ctx.cleanup() handles it
    await ctx.cleanup()
  })

  it("ensure creates a CNAME record", async () => {
    await ctx.client.dns.ensure(tunnelId, hostname)
    ctx.trackDns(tunnelId, hostname)

    const records = await ctx.client.dns.list(tunnelId)
    expect(records.some((r) => r.hostname === hostname)).toBe(true)
    expect(records.find((r) => r.hostname === hostname)?.type).toBe("CNAME")
    expect(records.find((r) => r.hostname === hostname)?.content).toContain(
      "cfargotunnel.com",
    )
  })

  it("ensure is idempotent (second call doesn't error)", async () => {
    // Should not throw
    await ctx.client.dns.ensure(tunnelId, hostname)
  })

  it("remove deletes the CNAME record", async () => {
    await ctx.client.dns.remove(tunnelId, hostname)

    const records = await ctx.client.dns.list(tunnelId)
    expect(records.some((r) => r.hostname === hostname)).toBe(false)
  })
})
