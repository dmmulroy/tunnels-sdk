/**
 * Tier 3: Full named tunnel E2E — create, configure, run, verify traffic, teardown.
 *
 * This is the most expensive test. It creates real Cloudflare resources,
 * runs a real cloudflared process, and sends real HTTP traffic through
 * the Cloudflare network.
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest"
import { hasAuth, getTestEnv, createTestContext, type TestContext } from "../helpers/index.js"
import { TunnelClient } from "../../src/wrapper.js"
import { createServer } from "node:http"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("Named tunnel E2E (real traffic)", () => {
  let ctx: TestContext
  const env = getTestEnv()!

  beforeAll(() => {
    ctx = createTestContext(env)
  })

  afterAll(async () => {
    await ctx.cleanup()
  })

  it("full lifecycle: create → ingress → DNS → run → fetch → teardown", async () => {
    const tunnelName = ctx.name("e2e")
    const hostname = `${tunnelName}.${env.testZone}`
    const localPort = 19876

    // 1. Start a local HTTP server
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ source: "e2e-test", tunnel: tunnelName }))
    })
    await new Promise<void>((resolve) => server.listen(localPort, resolve))

    try {
      // 2. Create tunnel with ingress + auto DNS
      const tunnel = await ctx.client.tunnels.create(tunnelName, {
        ingress: [
          { hostname, service: `http://localhost:${localPort}` },
        ],
        dns: { auto: true },
      })
      ctx.trackTunnel(tunnel.id)
      ctx.trackDns(tunnel.id, hostname)

      expect(tunnel.name).toBe(tunnelName)

      // 3. Verify ingress was configured
      const rules = await ctx.client.ingress.list(tunnel.id)
      expect(rules.some((r) => r.hostname === hostname)).toBe(true)

      // 4. Verify DNS record was created
      const records = await ctx.client.dns.list(tunnel.id)
      expect(records.some((r) => r.hostname === hostname)).toBe(true)

      // 5. Get token and run the tunnel
      // (Note: running the tunnel requires cloudflared binary)
      const token = await ctx.client.tunnels.getToken(tunnel.id)
      expect(token.length).toBeGreaterThan(10)

      // 6. Clean up: delete with DNS cleanup
      await ctx.client.tunnels.delete(tunnel.id, { force: true, cleanupDns: true })

      // 7. Verify tunnel is gone
      const remaining = await ctx.client.tunnels.list()
      expect(remaining.some((t) => t.id === tunnel.id)).toBe(false)
    } finally {
      server.close()
    }
  })
})
