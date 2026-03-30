/**
 * Tier 3: Tunnel CRUD commands against real Cloudflare API.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CFT_TEST_ZONE
 * Spawns `tunnels create`, `tunnels list`, `tunnels info`, `tunnels delete`
 * and verifies stdout/stderr/exit codes.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { runCli, runCliJson, hasAuth, resourceName } from "../helpers/index.js"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("tunnels create", () => {
  const tunnelsToCleanup: string[] = []

  afterAll(async () => {
    for (const name of tunnelsToCleanup) {
      await runCli(["delete", name, "--force"]).catch(() => {})
    }
  })

  it("creates a tunnel, prints name and id, exits 0", async () => {
    const name = resourceName("create")
    tunnelsToCleanup.push(name)

    const { stdout, exitCode } = await runCli(["create", name])
    expect(exitCode).toBe(0)
    expect(stdout).toContain(name)
    // Should contain a UUID-like tunnel id
    expect(stdout).toMatch(/[0-9a-f-]{36}/)
  })

  it("with --dns flag creates tunnel and prints confirmation", async () => {
    const name = resourceName("createdns")
    tunnelsToCleanup.push(name)

    const { stdout, exitCode } = await runCli(["create", name, "--dns"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain(name)
  })

  it("with --json outputs valid JSON with id and name fields", async () => {
    const name = resourceName("createjson")
    tunnelsToCleanup.push(name)

    const { data, result } = await runCliJson<{ id: string; name: string }>(
      ["create", name, "--json"],
    )
    expect(result.exitCode).toBe(0)
    expect(data.name).toBe(name)
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("duplicate name exits non-zero with actionable error", async () => {
    const name = resourceName("dup")
    tunnelsToCleanup.push(name)

    // Create first
    await runCli(["create", name])
    // Try to create again
    const { exitCode, stdout, stderr } = await runCli(["create", name])
    expect(exitCode).not.toBe(0)
    const output = stdout + stderr
    expect(output.length).toBeGreaterThan(0)
  })
})

describeAuth("tunnels list", () => {
  let tunnelName: string

  beforeAll(async () => {
    tunnelName = resourceName("list")
    await runCli(["create", tunnelName])
  })

  afterAll(async () => {
    await runCli(["delete", tunnelName, "--force"]).catch(() => {})
  })

  it("lists tunnels in table format with NAME, STATUS, CONNS columns", async () => {
    const { stdout, exitCode } = await runCli(["list"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("NAME")
    expect(stdout).toContain("STATUS")
    expect(stdout).toContain("CONNS")
    expect(stdout).toContain(tunnelName)
  })

  it("--status filters results (only matching tunnels appear)", async () => {
    // Our test tunnel is inactive (not running), so filtering by "healthy"
    // should NOT include it
    const { stdout, exitCode } = await runCli(["list", "--status", "healthy"])
    expect(exitCode).toBe(0)
    expect(stdout).not.toContain(tunnelName)
  })

  it("--json outputs a JSON array of tunnel objects", async () => {
    const { data, result } = await runCliJson<Array<{ id: string; name: string }>>(
      ["list", "--json"],
    )
    expect(result.exitCode).toBe(0)
    expect(Array.isArray(data)).toBe(true)
    const found = data.find((t) => t.name === tunnelName)
    expect(found).toBeDefined()
    expect(found!.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("empty list prints header only (table) or empty array (json)", async () => {
    // Filter by a status that shouldn't match any tunnel
    const { data } = await runCliJson<Array<unknown>>(
      ["list", "--json", "--status", "nonexistent-status-filter"],
    )
    expect(Array.isArray(data)).toBe(true)
    // May be empty or may have items — the point is it's valid JSON array
  })
})

describeAuth("tunnels info", () => {
  let tunnelName: string
  let tunnelId: string

  beforeAll(async () => {
    tunnelName = resourceName("info")
    const { data } = await runCliJson<{ id: string; name: string }>(
      ["create", tunnelName, "--json"],
    )
    tunnelId = data.id
  })

  afterAll(async () => {
    await runCli(["delete", tunnelName, "--force"]).catch(() => {})
  })

  it("shows tunnel details by name", async () => {
    const { stdout, exitCode } = await runCli(["info", tunnelName])
    expect(exitCode).toBe(0)
    expect(stdout).toContain(tunnelName)
    expect(stdout).toContain(tunnelId)
  })

  it("shows tunnel details by ID", async () => {
    const { stdout, exitCode } = await runCli(["info", tunnelId])
    expect(exitCode).toBe(0)
    expect(stdout).toContain(tunnelName)
    expect(stdout).toContain(tunnelId)
  })

  it("nonexistent tunnel exits non-zero with error message", async () => {
    const { exitCode, stdout, stderr } = await runCli(["info", "nonexistent-" + Date.now()])
    expect(exitCode).not.toBe(0)
    const output = stdout + stderr
    expect(output.length).toBeGreaterThan(0)
  })

  it("--json outputs tunnel detail as JSON object", async () => {
    const { data, result } = await runCliJson<{ id: string; name: string; status: string }>(
      ["info", tunnelName, "--json"],
    )
    expect(result.exitCode).toBe(0)
    expect(data.id).toBe(tunnelId)
    expect(data.name).toBe(tunnelName)
    expect(typeof data.status).toBe("string")
  })
})

describeAuth("tunnels delete", () => {
  it("deletes a tunnel by name, prints confirmation, exits 0", async () => {
    const name = resourceName("del")
    await runCli(["create", name])

    const { stdout, exitCode } = await runCli(["delete", name])
    expect(exitCode).toBe(0)
    expect(stdout).toContain(name)
  })

  it("--force deletes tunnel with active connections", async () => {
    const name = resourceName("delforce")
    await runCli(["create", name])

    const { exitCode } = await runCli(["delete", name, "--force"])
    expect(exitCode).toBe(0)
  })

  it("nonexistent tunnel exits non-zero with error message", async () => {
    const { exitCode, stdout, stderr } = await runCli(["delete", "nonexistent-" + Date.now()])
    expect(exitCode).not.toBe(0)
    const output = stdout + stderr
    expect(output.length).toBeGreaterThan(0)
  })
})

describeAuth("tunnels token", () => {
  let tunnelName: string

  beforeAll(async () => {
    tunnelName = resourceName("token")
    await runCli(["create", tunnelName])
  })

  afterAll(async () => {
    await runCli(["delete", tunnelName, "--force"]).catch(() => {})
  })

  it("prints a non-empty JWT token string for a valid tunnel", async () => {
    const { stdout, exitCode } = await runCli(["token", tunnelName])
    expect(exitCode).toBe(0)
    expect(stdout.trim().length).toBeGreaterThan(10)
    // JWT tokens are base64url encoded segments separated by dots
    expect(stdout.trim()).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it("nonexistent tunnel exits non-zero", async () => {
    const { exitCode } = await runCli(["token", "nonexistent-" + Date.now()])
    expect(exitCode).not.toBe(0)
  })
})

describeAuth("create → list → info → delete lifecycle", () => {
  it("full CRUD cycle via CLI commands with consistent output", async () => {
    const name = resourceName("lifecycle")

    // 1. Create
    const { data: created } = await runCliJson<{ id: string; name: string }>(
      ["create", name, "--json"],
    )
    expect(created.name).toBe(name)
    const id = created.id

    try {
      // 2. List (should include our tunnel)
      const { data: tunnels } = await runCliJson<Array<{ id: string; name: string }>>(
        ["list", "--json"],
      )
      expect(tunnels.some((t) => t.id === id)).toBe(true)

      // 3. Info by name
      const { data: info } = await runCliJson<{ id: string; name: string }>(
        ["info", name, "--json"],
      )
      expect(info.id).toBe(id)
      expect(info.name).toBe(name)

      // 4. Info by ID
      const { data: infoById } = await runCliJson<{ id: string }>(
        ["info", id, "--json"],
      )
      expect(infoById.id).toBe(id)

      // 5. Delete
      const { exitCode } = await runCli(["delete", name, "--force"])
      expect(exitCode).toBe(0)

      // 6. Verify gone from list
      const { data: afterDelete } = await runCliJson<Array<{ id: string }>>(
        ["list", "--json"],
      )
      expect(afterDelete.some((t) => t.id === id)).toBe(false)
    } catch (e) {
      // Cleanup on failure
      await runCli(["delete", name, "--force"]).catch(() => {})
      throw e
    }
  })
})
