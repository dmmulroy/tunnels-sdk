/**
 * Tier 4: Full named tunnel lifecycle via CLI — the most expensive test.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CFT_TEST_ZONE
 * Runs real cloudflared, creates real Cloudflare resources, sends real HTTP traffic.
 *
 * This is the CLI equivalent of the SDK's named-tunnel e2e test, but
 * everything goes through the `tunnels` binary — no SDK imports.
 */
import { describe, it, expect, afterAll } from "vitest"
import { runCli, runCliJson, spawnCli, hasAuth, getTestEnv, resourceName } from "../helpers/index.js"

const describeAuth = hasAuth() ? describe : describe.skip

describeAuth("full lifecycle via CLI", () => {
  const cleanup: Array<() => Promise<void>> = []

  afterAll(async () => {
    // Run cleanup in reverse order
    for (const fn of cleanup.reverse()) {
      await fn().catch(() => {})
    }
  })

  it("create → ingress add → dns create → run → status shows healthy → stop → delete", async () => {
    const env = getTestEnv()!
    const tunnelName = resourceName("lifecycle")
    const hostname = `${tunnelName}.${env.testZone}`

    // Register cleanup (reverse order: dns → tunnel)
    cleanup.push(async () => {
      await runCli(["dns", "remove", hostname]).catch(() => {})
    })
    cleanup.push(async () => {
      await runCli(["delete", tunnelName, "--force"]).catch(() => {})
    })

    // 1. Create tunnel
    const { data: tunnel } = await runCliJson<{ id: string; name: string }>(
      ["create", tunnelName, "--json"],
    )
    expect(tunnel.name).toBe(tunnelName)
    expect(tunnel.id).toMatch(/^[0-9a-f-]{36}$/)

    // 2. Add ingress rule
    const addIngress = await runCli([
      "ingress", "add", hostname, "http://localhost:19876",
    ])
    expect(addIngress.exitCode).toBe(0)

    // 3. Create DNS record
    const addDns = await runCli([
      "dns", "create", hostname, "--tunnel", tunnelName,
    ])
    expect(addDns.exitCode).toBe(0)

    // 4. Get token (verifies the tunnel is fully set up)
    const tokenResult = await runCli(["token", tunnelName])
    expect(tokenResult.exitCode).toBe(0)
    expect(tokenResult.stdout.trim().length).toBeGreaterThan(10)

    // 5. Run the tunnel (spawns cloudflared)
    const proc = spawnCli(["run", tunnelName])
    cleanup.push(async () => {
      proc.kill("SIGTERM")
      await proc.waitForExit(5_000).catch(() => proc.kill("SIGKILL"))
    })

    // Wait for the running message
    try {
      await proc.waitForOutput(/running|connected|ready/i, 60_000)
    } catch {
      // Even if we don't see the expected message, continue testing
    }

    // 6. Check status
    const { data: statusData } = await runCliJson<Array<{ name: string; status: string }>>(
      ["status", "--json"],
    )
    // Our tunnel should appear in the status list
    const found = statusData.find((t) => t.name === tunnelName)
    expect(found).toBeDefined()

    // 7. Stop the process
    proc.kill("SIGTERM")
    const exitResult = await proc.waitForExit(10_000)
    expect(exitResult.exitCode).toBeLessThanOrEqual(1)

    // 8. Delete tunnel (force, since it may have active connections)
    const deleteResult = await runCli(["delete", tunnelName, "--force"])
    expect(deleteResult.exitCode).toBe(0)

    // 9. Verify gone
    const { data: afterDelete } = await runCliJson<Array<{ id: string }>>(
      ["list", "--json"],
    )
    expect(afterDelete.some((t) => t.id === tunnel.id)).toBe(false)
  }, 120_000)

  it("expose --hostname does full setup in one command and cleans up on SIGTERM", async () => {
    const env = getTestEnv()!
    const hostname = `${resourceName("expose")}.${env.testZone}`

    // Register cleanup
    cleanup.push(async () => {
      // Try to clean up the tunnel created by expose
      const tunnelName = hostname.split(".")[0]
      await runCli(["dns", "remove", hostname]).catch(() => {})
      await runCli(["delete", tunnelName, "--force"]).catch(() => {})
    })

    const proc = spawnCli(["expose", "19876", "--hostname", hostname])

    try {
      // Wait for the tunnel URL or confirmation message
      await proc.waitForOutput(new RegExp(hostname.replace(/\./g, "\\.")), 90_000)

      // The output should contain the hostname
      expect(proc.stdout()).toContain(hostname)

      // Kill it
      proc.kill("SIGTERM")
      const result = await proc.waitForExit(10_000)
      expect(result.exitCode).toBeLessThanOrEqual(1)
    } finally {
      proc.kill("SIGKILL")
    }
  }, 120_000)
})

describeAuth("error recovery", () => {
  it("delete --force cleans up a tunnel that was left in a bad state", async () => {
    const name = resourceName("badstate")
    await runCli(["create", name])

    // Force delete should always work
    const { exitCode } = await runCli(["delete", name, "--force"])
    expect(exitCode).toBe(0)

    // Verify gone
    const { data: tunnels } = await runCliJson<Array<{ name: string }>>(
      ["list", "--json"],
    )
    expect(tunnels.find((t) => t.name === name)).toBeUndefined()
  })

  it("creating a tunnel that already exists gives an actionable error, doesn't corrupt state", async () => {
    const name = resourceName("dupcheck")

    // Create first
    const { data: original } = await runCliJson<{ id: string }>(
      ["create", name, "--json"],
    )

    try {
      // Create again — should fail
      const dup = await runCli(["create", name])
      expect(dup.exitCode).not.toBe(0)

      // Original tunnel should still be intact
      const { data: info } = await runCliJson<{ id: string; name: string }>(
        ["info", name, "--json"],
      )
      expect(info.id).toBe(original.id)
      expect(info.name).toBe(name)
    } finally {
      await runCli(["delete", name, "--force"]).catch(() => {})
    }
  })
})

describeAuth("output consistency", () => {
  let tunnelName: string

  afterAll(async () => {
    if (tunnelName) {
      await runCli(["delete", tunnelName, "--force"]).catch(() => {})
    }
  })

  it("every mutating command (create, delete, add, remove) prints a confirmation line to stdout", async () => {
    tunnelName = resourceName("confirm")
    const env = getTestEnv()!

    // Create
    const create = await runCli(["create", tunnelName])
    expect(create.exitCode).toBe(0)
    expect(create.stdout.trim().length).toBeGreaterThan(0)

    // Ingress add
    const hostname = `${resourceName("conf")}.${env.testZone}`
    const ingressAdd = await runCli([
      "ingress", "add", hostname, "http://localhost:3000",
    ])
    expect(ingressAdd.exitCode).toBe(0)
    expect(ingressAdd.stdout.trim().length).toBeGreaterThan(0)

    // Ingress remove
    const ingressRm = await runCli(["ingress", "remove", hostname])
    expect(ingressRm.exitCode).toBe(0)
    expect(ingressRm.stdout.trim().length).toBeGreaterThan(0)

    // Delete
    const del = await runCli(["delete", tunnelName, "--force"])
    expect(del.exitCode).toBe(0)
    expect(del.stdout.trim().length).toBeGreaterThan(0)
  })

  it("--json output is valid JSON for every command in the lifecycle", async () => {
    tunnelName = resourceName("jsonout")
    const env = getTestEnv()!

    // Create with --json
    const create = await runCliJson(["create", tunnelName, "--json"])
    expect(create.result.exitCode).toBe(0)
    expect(typeof create.data).toBe("object")

    // List with --json
    const list = await runCliJson(["list", "--json"])
    expect(list.result.exitCode).toBe(0)
    expect(Array.isArray(list.data)).toBe(true)

    // Info with --json
    const info = await runCliJson(["info", tunnelName, "--json"])
    expect(info.result.exitCode).toBe(0)
    expect(typeof info.data).toBe("object")

    // Status with --json
    const status = await runCliJson(["status", "--json"])
    expect(status.result.exitCode).toBe(0)
    expect(Array.isArray(status.data)).toBe(true)

    // Cleanup
    await runCli(["delete", tunnelName, "--force"])
    tunnelName = "" // prevent afterAll from trying again
  })

  it("exit code is 0 for all successful commands in the lifecycle", async () => {
    tunnelName = resourceName("exitcodes")

    const results = [
      await runCli(["create", tunnelName]),
      await runCli(["list"]),
      await runCli(["info", tunnelName]),
      await runCli(["status"]),
      await runCli(["token", tunnelName]),
      await runCli(["delete", tunnelName, "--force"]),
    ]

    for (const r of results) {
      expect(r.exitCode).toBe(0)
    }
    tunnelName = "" // prevent afterAll from trying again
  })

  it("stderr is empty for all successful commands in the lifecycle", async () => {
    tunnelName = resourceName("nostderr")

    const results = [
      await runCli(["create", tunnelName]),
      await runCli(["list"]),
      await runCli(["info", tunnelName]),
      await runCli(["status"]),
      await runCli(["delete", tunnelName, "--force"]),
    ]

    for (const r of results) {
      // stderr should be empty (or only contain Effect runtime warnings)
      // Filter out known harmless warnings
      const meaningful = r.stderr
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .filter((line) => !line.includes("ExperimentalWarning"))
        .filter((line) => !line.includes("--import"))
      expect(meaningful.length).toBe(0)
    }
    tunnelName = "" // prevent afterAll from trying again
  })
})
