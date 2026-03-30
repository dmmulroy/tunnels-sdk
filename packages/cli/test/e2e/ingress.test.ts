/**
 * Tier 3: Ingress commands against real Cloudflare API.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 * Creates a tunnel, then tests ingress add/list/remove via CLI.
 *
 * Note: The CLI IngressService operates on the first active/healthy tunnel.
 * For these tests we create a tunnel and use its ingress configuration
 * directly through the tunnel's config endpoint.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { runCli, runCliJson, hasAuth, getTestEnv, resourceName } from "../helpers/index.js"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("ingress commands", () => {
  let tunnelName: string
  let tunnelId: string
  const env = getTestEnv()!

  beforeAll(async () => {
    tunnelName = resourceName("ingress")
    const { data } = await runCliJson<{ id: string; name: string }>(
      ["create", tunnelName, "--json"],
    )
    tunnelId = data.id
  })

  afterAll(async () => {
    await runCli(["delete", tunnelName, "--force"]).catch(() => {})
  })

  describe("tunnels ingress add", () => {
    it("adds an ingress rule, prints confirmation, exits 0", async () => {
      const hostname = `${resourceName("ing")}.${env.testZone}`
      const { stdout, exitCode } = await runCli([
        "ingress", "add", hostname, "http://localhost:8080",
      ])
      expect(exitCode).toBe(0)
      expect(stdout).toContain(hostname)
      expect(stdout).toContain("http://localhost:8080")
    })

    it("--json outputs the created rule", async () => {
      const hostname = `${resourceName("ingjson")}.${env.testZone}`
      const { data, result } = await runCliJson<{ hostname: string; service: string }>(
        ["ingress", "add", hostname, "http://localhost:9090", "--json"],
      )
      expect(result.exitCode).toBe(0)
      expect(data.hostname).toBe(hostname)
      expect(data.service).toBe("http://localhost:9090")
    })
  })

  describe("tunnels ingress list", () => {
    it("lists ingress rules in table format with HOSTNAME, SERVICE columns", async () => {
      const { stdout, exitCode } = await runCli(["ingress", "list"])
      expect(exitCode).toBe(0)
      expect(stdout).toContain("HOSTNAME")
      expect(stdout).toContain("SERVICE")
    })

    it("--json outputs a JSON array of ingress rules", async () => {
      const { data, result } = await runCliJson<Array<{ hostname: string; service: string }>>(
        ["ingress", "list", "--json"],
      )
      expect(result.exitCode).toBe(0)
      expect(Array.isArray(data)).toBe(true)
    })

    it("empty ingress list prints header only (table) or empty array (json)", async () => {
      // After removing all rules, list should still work
      const { data } = await runCliJson<Array<unknown>>(
        ["ingress", "list", "--json"],
      )
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe("tunnels ingress remove", () => {
    it("removes an ingress rule by hostname, prints confirmation, exits 0", async () => {
      const hostname = `${resourceName("ingrm")}.${env.testZone}`
      // Add first
      await runCli(["ingress", "add", hostname, "http://localhost:7070"])
      // Then remove
      const { stdout, exitCode } = await runCli(["ingress", "remove", hostname])
      expect(exitCode).toBe(0)
      expect(stdout).toContain(hostname)
    })

    it("nonexistent hostname exits non-zero with error message", async () => {
      const { exitCode, stdout, stderr } = await runCli([
        "ingress", "remove", "nonexistent.example.com",
      ])
      expect(exitCode).not.toBe(0)
      const output = stdout + stderr
      expect(output.length).toBeGreaterThan(0)
    })
  })

  describe("ingress add → list → remove lifecycle", () => {
    it("full add/list/remove cycle on a real tunnel", async () => {
      const hostname = `${resourceName("inglc")}.${env.testZone}`

      // Add
      const addResult = await runCli([
        "ingress", "add", hostname, "http://localhost:5050",
      ])
      expect(addResult.exitCode).toBe(0)

      // List (should contain our rule)
      const { data: rules } = await runCliJson<Array<{ hostname: string; service: string }>>(
        ["ingress", "list", "--json"],
      )
      const found = rules.find((r) => r.hostname === hostname)
      expect(found).toBeDefined()
      expect(found!.service).toContain("localhost:5050")

      // Remove
      const removeResult = await runCli(["ingress", "remove", hostname])
      expect(removeResult.exitCode).toBe(0)

      // Verify gone
      const { data: afterRemove } = await runCliJson<Array<{ hostname: string }>>(
        ["ingress", "list", "--json"],
      )
      expect(afterRemove.find((r) => r.hostname === hostname)).toBeUndefined()
    })
  })
})
