/**
 * Tier 3: Route commands against real Cloudflare API.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 * Creates a tunnel, then tests route add/list/remove via CLI.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { runCli, runCliJson, hasAuth, resourceName } from "../helpers/index.js"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("route commands", () => {
  let tunnelName: string
  let tunnelId: string

  // Use unique CIDR ranges that won't collide across test runs
  // Private IP space 10.x.x.x/24 with random second octet
  const randomOctet = () => Math.floor(Math.random() * 254) + 1
  const cidr = () => `10.${randomOctet()}.${randomOctet()}.0/24`

  beforeAll(async () => {
    tunnelName = resourceName("route")
    const { data } = await runCliJson<{ id: string; name: string }>(
      ["create", tunnelName, "--json"],
    )
    tunnelId = data.id
  })

  afterAll(async () => {
    await runCli(["delete", tunnelName, "--force"]).catch(() => {})
  })

  describe("tunnels route add", () => {
    it("adds a private network route, prints confirmation, exits 0", async () => {
      const network = cidr()
      const { stdout, exitCode } = await runCli([
        "route", "add", network, "--tunnel", tunnelName,
      ])
      expect(exitCode).toBe(0)
      expect(stdout).toContain(network)
      expect(stdout).toContain(tunnelName)
    })

    it("invalid CIDR exits non-zero with error message", async () => {
      const { exitCode, stdout, stderr } = await runCli([
        "route", "add", "not-a-cidr", "--tunnel", tunnelName,
      ])
      expect(exitCode).not.toBe(0)
      const output = stdout + stderr
      expect(output.length).toBeGreaterThan(0)
    })
  })

  describe("tunnels route list", () => {
    it("lists routes in table format with NETWORK, TUNNEL columns", async () => {
      const { stdout, exitCode } = await runCli(["route", "list"])
      expect(exitCode).toBe(0)
      expect(stdout).toContain("NETWORK")
      expect(stdout).toContain("TUNNEL")
    })

    it("--json outputs a JSON array of routes", async () => {
      const { data, result } = await runCliJson<Array<{ network: string; tunnel: string }>>(
        ["route", "list", "--json"],
      )
      expect(result.exitCode).toBe(0)
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe("tunnels route remove", () => {
    it("removes a route by CIDR, prints confirmation, exits 0", async () => {
      const network = cidr()
      // Add first
      await runCli(["route", "add", network, "--tunnel", tunnelName])

      const { stdout, exitCode } = await runCli(["route", "remove", network])
      expect(exitCode).toBe(0)
      expect(stdout).toContain(network)
    })

    it("nonexistent route exits non-zero with error message", async () => {
      const { exitCode, stdout, stderr } = await runCli([
        "route", "remove", "172.31.255.0/24",
      ])
      expect(exitCode).not.toBe(0)
      const output = stdout + stderr
      expect(output.length).toBeGreaterThan(0)
    })
  })

  describe("route add → list → remove lifecycle", () => {
    it("full add/list/remove cycle for a private network route", async () => {
      const network = cidr()

      // Add
      const addResult = await runCli([
        "route", "add", network, "--tunnel", tunnelName,
      ])
      expect(addResult.exitCode).toBe(0)

      // List (should contain our route)
      const { data: routes } = await runCliJson<Array<{ network: string; tunnel: string }>>(
        ["route", "list", "--json"],
      )
      const found = routes.find((r) => r.network === network)
      expect(found).toBeDefined()
      expect(found!.tunnel).toBe(tunnelName)

      // Remove
      const removeResult = await runCli(["route", "remove", network])
      expect(removeResult.exitCode).toBe(0)

      // Verify gone
      const { data: afterRemove } = await runCliJson<Array<{ network: string }>>(
        ["route", "list", "--json"],
      )
      expect(afterRemove.find((r) => r.network === network)).toBeUndefined()
    })
  })
})
