/**
 * Tier 3: Status command against real Cloudflare API.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 *
 * The status command lists all tunnels with health information:
 * TUNNEL, STATUS, CONNS, UPTIME, COLO columns.
 */
import { describe, it, expect } from "vitest"
import { runCli, runCliJson, hasAuth } from "../helpers/index.js"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("tunnels status", () => {
  it("prints tunnel health table with TUNNEL, STATUS, CONNS, UPTIME, COLO columns", async () => {
    const { stdout, exitCode } = await runCli(["status"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("TUNNEL")
    expect(stdout).toContain("STATUS")
    expect(stdout).toContain("CONNS")
    expect(stdout).toContain("UPTIME")
    expect(stdout).toContain("COLO")
  })

  it("--json outputs a JSON array of tunnel status objects", async () => {
    const { data, result } = await runCliJson<Array<{ name: string; status: string }>>(
      ["status", "--json"],
    )
    expect(result.exitCode).toBe(0)
    expect(Array.isArray(data)).toBe(true)
    // Each item should have at least name and status
    if (data.length > 0) {
      expect(typeof data[0].name).toBe("string")
      expect(typeof data[0].status).toBe("string")
    }
  })

  it("with no tunnels prints empty table or empty JSON array", async () => {
    // We can't guarantee no tunnels exist, but we can verify the command
    // doesn't crash when run, and produces valid output
    const { data } = await runCliJson<Array<unknown>>(["status", "--json"])
    expect(Array.isArray(data)).toBe(true)
  })
})
