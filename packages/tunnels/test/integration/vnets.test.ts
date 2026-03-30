/**
 * Tier 2: Virtual network management against real Cloudflare API.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { hasAuth, getTestEnv, createTestContext, type TestContext } from "../helpers/index.js"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("VNet management (real API)", () => {
  let ctx: TestContext

  beforeAll(() => {
    ctx = createTestContext(getTestEnv()!)
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  it("create → list → delete lifecycle", async () => {
    const name = ctx.name("vnet")

    const vnet = await ctx.client.vnets.create(name, { comment: "integration test" })
    ctx.trackVnet(name)
    expect(vnet.name).toBe(name)
    expect(vnet.id).toBeDefined()
    expect(vnet.isDefault).toBe(false)

    const all = await ctx.client.vnets.list()
    expect(all.some((v) => v.name === name)).toBe(true)

    await ctx.client.vnets.delete(name)

    const afterDelete = await ctx.client.vnets.list()
    expect(afterDelete.some((v) => v.name === name)).toBe(false)
  })
})
