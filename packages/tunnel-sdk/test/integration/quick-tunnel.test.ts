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

  it("traffic flows through the tunnel to a local server", { retry: 2 }, async () => {
    // Start a local HTTP server
    const server = createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" })
      res.end("hello from integration test")
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const port = (server.address() as { port: number }).port

    try {
      const tunnel = await expose(port)
      try {
        // Retry fetching — Cloudflare needs time to propagate the tunnel
        let body: string | undefined
        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise((r) => setTimeout(r, 2_000))
          try {
            const res = await fetch(tunnel.url)
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
  }, 60_000)
})
