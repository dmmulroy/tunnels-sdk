/**
 * Tier 3: Virtual network commands against real Cloudflare API.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 */
import { describe, it, expect, afterAll } from "vitest"
import { runCli, runCliJson, hasAuth, resourceName } from "../helpers/index.js"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("vnet commands", () => {
  const vnetsToCleanup: string[] = []

  afterAll(async () => {
    for (const name of vnetsToCleanup) {
      await runCli(["vnet", "delete", name]).catch(() => {})
    }
  })

  describe("tunnels vnet create", () => {
    it("creates a virtual network, prints confirmation, exits 0", async () => {
      const name = resourceName("vnet")
      vnetsToCleanup.push(name)

      const { stdout, exitCode } = await runCli(["vnet", "create", name])
      expect(exitCode).toBe(0)
      expect(stdout).toContain(name)
    })

    it("--default creates a default virtual network", async () => {
      const name = resourceName("vnetdef")
      vnetsToCleanup.push(name)

      const { stdout, exitCode } = await runCli(["vnet", "create", name, "--default"])
      expect(exitCode).toBe(0)
      expect(stdout).toContain(name)
    })

    it("duplicate name exits non-zero with error message", async () => {
      const name = resourceName("vnetdup")
      vnetsToCleanup.push(name)

      // Create first
      await runCli(["vnet", "create", name])
      // Try again
      const { exitCode, stdout, stderr } = await runCli(["vnet", "create", name])
      expect(exitCode).not.toBe(0)
      const output = stdout + stderr
      expect(output.length).toBeGreaterThan(0)
    })
  })

  describe("tunnels vnet list", () => {
    it("lists virtual networks in table format with NAME, DEFAULT columns", async () => {
      const { stdout, exitCode } = await runCli(["vnet", "list"])
      expect(exitCode).toBe(0)
      expect(stdout).toContain("NAME")
      expect(stdout).toContain("DEFAULT")
    })

    it("--json outputs a JSON array of vnets", async () => {
      const { data, result } = await runCliJson<Array<{ name: string; isDefault: boolean }>>(
        ["vnet", "list", "--json"],
      )
      expect(result.exitCode).toBe(0)
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe("tunnels vnet delete", () => {
    it("deletes a virtual network, prints confirmation, exits 0", async () => {
      const name = resourceName("vnetdel")
      await runCli(["vnet", "create", name])

      const { stdout, exitCode } = await runCli(["vnet", "delete", name])
      expect(exitCode).toBe(0)
      expect(stdout).toContain(name)
    })

    it("nonexistent vnet exits non-zero with error message", async () => {
      const { exitCode, stdout, stderr } = await runCli([
        "vnet", "delete", "nonexistent-" + Date.now(),
      ])
      expect(exitCode).not.toBe(0)
      const output = stdout + stderr
      expect(output.length).toBeGreaterThan(0)
    })
  })

  describe("vnet create → list → delete lifecycle", () => {
    it("full create/list/delete cycle for a virtual network", async () => {
      const name = resourceName("vnetlc")

      // Create
      const createResult = await runCli(["vnet", "create", name])
      expect(createResult.exitCode).toBe(0)

      // List (should contain our vnet)
      const { data: vnets } = await runCliJson<Array<{ name: string; isDefault: boolean }>>(
        ["vnet", "list", "--json"],
      )
      const found = vnets.find((v) => v.name === name)
      expect(found).toBeDefined()

      // Delete
      const deleteResult = await runCli(["vnet", "delete", name])
      expect(deleteResult.exitCode).toBe(0)

      // Verify gone
      const { data: afterDelete } = await runCliJson<Array<{ name: string }>>(
        ["vnet", "list", "--json"],
      )
      expect(afterDelete.find((v) => v.name === name)).toBeUndefined()
    })
  })
})
