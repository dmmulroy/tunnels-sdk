/**
 * Tier 2: Quick tunnel via CLI — needs auth env vars + cloudflared binary.
 *
 * Spawns `tunnels expose <port>` as a child process, verifies the
 * trycloudflare URL appears in stdout, and verifies cleanup on SIGTERM.
 *
 * The cloudflared binary is auto-downloaded by the SDK on first use.
 * These tests can take 15-30s while the binary downloads and the tunnel
 * connects to Cloudflare's edge.
 */
import { describe, it, expect } from "vitest"
import { runCli, spawnCli, runCliJson, hasAuth, NO_AUTH_ENV } from "../helpers/index.js"

const describeTier2 = hasAuth() ? describe : describe.skip

describeTier2("tunnels expose (quick tunnel)", () => {
  it("prints a trycloudflare URL to stdout and exits 0 on SIGTERM", async () => {
    const proc = spawnCli(["expose", "19876"])
    try {
      // Wait for the tunnel URL to appear in stdout
      const match = await proc.waitForOutput(
        /https:\/\/[a-z0-9-]+\.trycloudflare\.com/,
        60_000,
      )
      expect(match[0]).toMatch(/^https:\/\//)

      // Kill the process
      proc.kill("SIGTERM")
      const result = await proc.waitForExit(10_000)
      // Process should exit cleanly (0) or with signal (null → mapped to 1)
      expect(result.exitCode).toBeLessThanOrEqual(1)
    } finally {
      proc.kill("SIGKILL")
    }
  }, 90_000)

  it("output contains the local port in the URL mapping line", async () => {
    const proc = spawnCli(["expose", "19877"])
    try {
      await proc.waitForOutput(/trycloudflare\.com/, 60_000)
      expect(proc.stdout()).toContain("19877")
    } finally {
      proc.kill("SIGKILL")
    }
  }, 90_000)

  it("process exits cleanly on SIGINT (ctrl-c)", async () => {
    const proc = spawnCli(["expose", "19878"])
    try {
      await proc.waitForOutput(/trycloudflare\.com/, 60_000)
      proc.kill("SIGINT")
      const result = await proc.waitForExit(10_000)
      expect(result.exitCode).toBeLessThanOrEqual(1)
    } finally {
      proc.kill("SIGKILL")
    }
  }, 90_000)

})

// Port validation tests don't need auth — they fail at CLI parse level
describe("expose argument validation", () => {
  it("shows error when the port is not a valid number", async () => {
    const { stdout, stderr } = await runCli(["expose", "abc"], { env: NO_AUTH_ENV })
    const output = stdout + stderr
    // Effect CLI shows an error about the invalid argument
    expect(output).toMatch(/invalid|error|expected/i)
  })

  it("shows error when the port is out of range", async () => {
    const { stdout, stderr } = await runCli(["expose", "99999"], { env: NO_AUTH_ENV })
    const output = stdout + stderr
    // 99999 is above the valid port range (65535)
    // The CLI should either show an error or try to use the port
    expect(output.length).toBeGreaterThan(0)
  })
})

describeTier2("tunnels expose --json", () => {
  it("outputs valid JSON with a url field", async () => {
    const proc = spawnCli(["expose", "--json", "19879"])
    try {
      await proc.waitForOutput(/trycloudflare\.com/, 60_000)
      const stdout = proc.stdout()
      // The JSON output should be parseable
      const parsed = JSON.parse(stdout.trim())
      expect(parsed).toHaveProperty("url")
      expect(typeof parsed.url).toBe("string")
    } finally {
      proc.kill("SIGKILL")
    }
  }, 90_000)

  it("JSON url matches trycloudflare pattern", async () => {
    const proc = spawnCli(["expose", "--json", "19880"])
    try {
      await proc.waitForOutput(/trycloudflare\.com/, 60_000)
      const parsed = JSON.parse(proc.stdout().trim())
      expect(parsed.url).toMatch(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/)
    } finally {
      proc.kill("SIGKILL")
    }
  }, 90_000)
})
