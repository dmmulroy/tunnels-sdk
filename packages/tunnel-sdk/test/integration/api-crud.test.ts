/**
 * Tier 2: Tunnel CRUD against real Cloudflare API.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CFT_TEST_ZONE
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { hasAuth, getTestEnv, createTestContext, type TestContext } from "../helpers/index.js"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("Tunnel CRUD (real API)", () => {
  let ctx: TestContext

  beforeAll(() => {
    ctx = createTestContext(getTestEnv()!)
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  it("create → get → list → delete lifecycle", async () => {
    const name = ctx.name("crud")

    // Create
    const tunnel = await ctx.client.tunnels.create(name)
    ctx.trackTunnel(tunnel.id)
    expect(tunnel.name).toBe(name)
    expect(tunnel.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(tunnel.status).toBeDefined()

    // Get by ID
    const byId = await ctx.client.tunnels.get(tunnel.id)
    expect(byId.id).toBe(tunnel.id)
    expect(byId.name).toBe(name)

    // Get by name
    const byName = await ctx.client.tunnels.get(name)
    expect(byName.id).toBe(tunnel.id)

    // List (should include our tunnel)
    const all = await ctx.client.tunnels.list()
    expect(all.some((t) => t.id === tunnel.id)).toBe(true)

    // Delete
    await ctx.client.tunnels.delete(tunnel.id, { force: true })

    // Verify gone from active list
    const afterDelete = await ctx.client.tunnels.list()
    expect(afterDelete.some((t) => t.id === tunnel.id)).toBe(false)
  })

  it("getToken returns a non-empty string", async () => {
    const name = ctx.name("token")
    const tunnel = await ctx.client.tunnels.create(name)
    ctx.trackTunnel(tunnel.id)

    const token = await ctx.client.tunnels.getToken(tunnel.id)
    expect(typeof token).toBe("string")
    expect(token.length).toBeGreaterThan(10)
  })

  it("get nonexistent tunnel rejects", async () => {
    await expect(
      ctx.client.tunnels.get("nonexistent-name-" + Date.now()),
    ).rejects.toThrow()
  })

  it("delete with force on already-deleted tunnel is safe", async () => {
    const name = ctx.name("dbldelete")
    const tunnel = await ctx.client.tunnels.create(name)
    await ctx.client.tunnels.delete(tunnel.id, { force: true })

    // Second delete should fail gracefully (API returns 404)
    await expect(
      ctx.client.tunnels.delete(tunnel.id, { force: true }),
    ).rejects.toThrow()
  })
})
