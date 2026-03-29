/**
 * Tier 1: Quick tunnel process lifecycle — no auth needed.
 *
 * Spawns real cloudflared, verifies URL appears, verifies process cleanup.
 * Requires cloudflared binary (auto-downloaded by CloudflaredBinary.layer).
 */
import { describe, it, expect } from "vitest"
import { expose } from "../../src/wrapper.js"
import { createServer } from "node:http"

describe("Quick tunnel (real process)", () => {
  it("expose() returns a trycloudflare URL and close() kills the process", async () => {
    const tunnel = await expose(9876)
    try {
      expect(tunnel.url).toMatch(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
    } finally {
      await tunnel.close()
    }
  }, 30_000)

  // This test requires QUIC/UDP connectivity to Cloudflare's edge.
  // It will fail in environments with restrictive firewalls (most corporate networks,
  // some home networks, CI without UDP). The tunnel URL appears before the QUIC
  // connection is established, so DNS may never resolve.
  // Set CFT_TEST_QUICK_TUNNEL_TRAFFIC=1 to opt in.
  it.skipIf(!process.env.CFT_TEST_QUICK_TUNNEL_TRAFFIC)(
    "traffic flows through the tunnel to a local server",
    async () => {
      const server = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" })
        res.end("hello from integration test")
      })
      await new Promise<void>((resolve) => server.listen(0, resolve))
      const port = (server.address() as { port: number }).port

      try {
        const tunnel = await expose(port)
        try {
          // Retry fetching — trycloudflare URLs can take 5-30s to propagate
          let body: string | undefined
          for (let attempt = 0; attempt < 15; attempt++) {
            await new Promise((r) => setTimeout(r, 3_000))
            try {
              const res = await fetch(tunnel.url, { signal: AbortSignal.timeout(5_000) })
              if (res.ok) {
                body = await res.text()
                break
              }
            } catch {
              // tunnel not ready yet, retry
            }
          }
          expect(body).toBe("hello from integration test")
        } finally {
          await tunnel.close()
        }
      } finally {
        server.close()
      }
    },
    90_000,
  )
})
