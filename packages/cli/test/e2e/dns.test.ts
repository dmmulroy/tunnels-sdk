/**
 * Tier 3: DNS commands against real Cloudflare API.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CFT_TEST_ZONE
 * Creates a tunnel, then tests dns create/list/remove via CLI.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { runCli, runCliJson, hasAuth, getTestEnv, resourceName } from "../helpers/index.js"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("dns commands", () => {
  let tunnelName: string
  let tunnelId: string
  const env = getTestEnv()!
  const dnsRecordsToCleanup: string[] = []

  beforeAll(async () => {
    tunnelName = resourceName("dns")
    const { data } = await runCliJson<{ id: string; name: string }>(
      ["create", tunnelName, "--json"],
    )
    tunnelId = data.id
  })

  afterAll(async () => {
    // Clean up DNS records first
    for (const hostname of dnsRecordsToCleanup) {
      await runCli(["dns", "remove", hostname]).catch(() => {})
    }
    // Then the tunnel
    await runCli(["delete", tunnelName, "--force"]).catch(() => {})
  })

  describe("tunnels dns create", () => {
    it("creates a CNAME record, prints confirmation, exits 0", async () => {
      const hostname = `${resourceName("dnsc")}.${env.testZone}`
      dnsRecordsToCleanup.push(hostname)

      const { stdout, exitCode } = await runCli([
        "dns", "create", hostname, "--tunnel", tunnelName,
      ])
      expect(exitCode).toBe(0)
      expect(stdout).toContain(hostname)
      expect(stdout).toContain(tunnelName)
    })

    it("--json outputs the created record", async () => {
      const hostname = `${resourceName("dnsj")}.${env.testZone}`
      dnsRecordsToCleanup.push(hostname)

      const { data, result } = await runCliJson<{ hostname: string; tunnel: string }>(
        ["dns", "create", hostname, "--tunnel", tunnelName, "--json"],
      )
      expect(result.exitCode).toBe(0)
      expect(data.hostname).toBe(hostname)
      expect(data.tunnel).toBe(tunnelName)
    })
  })

  describe("tunnels dns list", () => {
    it("lists DNS records in table format with HOSTNAME, TUNNEL columns", async () => {
      const { stdout, exitCode } = await runCli(["dns", "list"])
      expect(exitCode).toBe(0)
      expect(stdout).toContain("HOSTNAME")
      expect(stdout).toContain("TUNNEL")
    })

    it("--json outputs a JSON array of DNS records", async () => {
      const { data, result } = await runCliJson<Array<{ hostname: string; tunnel: string }>>(
        ["dns", "list", "--json"],
      )
      expect(result.exitCode).toBe(0)
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe("tunnels dns remove", () => {
    it("removes a DNS record by hostname, prints confirmation, exits 0", async () => {
      const hostname = `${resourceName("dnsrm")}.${env.testZone}`
      // Create first
      await runCli(["dns", "create", hostname, "--tunnel", tunnelName])

      const { stdout, exitCode } = await runCli(["dns", "remove", hostname])
      expect(exitCode).toBe(0)
      expect(stdout).toContain(hostname)
    })

    it("nonexistent hostname exits non-zero with error message", async () => {
      const { exitCode, stdout, stderr } = await runCli([
        "dns", "remove", "nonexistent-" + Date.now() + "." + env.testZone,
      ])
      expect(exitCode).not.toBe(0)
      const output = stdout + stderr
      expect(output.length).toBeGreaterThan(0)
    })
  })

  describe("dns create → list → remove lifecycle", () => {
    it("full create/list/remove cycle for a CNAME record", async () => {
      const hostname = `${resourceName("dnslc")}.${env.testZone}`

      // Create
      const createResult = await runCli([
        "dns", "create", hostname, "--tunnel", tunnelName,
      ])
      expect(createResult.exitCode).toBe(0)

      // List (should contain our record)
      const { data: records } = await runCliJson<Array<{ hostname: string; tunnel: string }>>(
        ["dns", "list", "--json"],
      )
      const found = records.find((r) => r.hostname === hostname)
      expect(found).toBeDefined()
      expect(found!.tunnel).toBe(tunnelName)

      // Remove
      const removeResult = await runCli(["dns", "remove", hostname])
      expect(removeResult.exitCode).toBe(0)

      // Verify gone
      const { data: afterRemove } = await runCliJson<Array<{ hostname: string }>>(
        ["dns", "list", "--json"],
      )
      expect(afterRemove.find((r) => r.hostname === hostname)).toBeUndefined()
    })
  })
})
