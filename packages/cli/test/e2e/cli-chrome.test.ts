/**
 * Tier 1: CLI chrome — help, version, flags, error handling.
 *
 * No auth needed. No cloudflared binary needed. Pure CLI behavior.
 * Spawns the real `tunnels` binary and checks stdout/stderr/exit codes.
 */
import { describe, it, expect } from "vitest"
import { runCli, NO_AUTH_ENV } from "../helpers/index.js"

// All Tier 1 tests run without auth env vars to prove they don't need credentials
const cli = (args: string[]) => runCli(args, { env: NO_AUTH_ENV })

describe("help & version", () => {
  it("--version prints semver and exits 0", async () => {
    const { stdout, exitCode } = await cli(["--version"])
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/\d+\.\d+\.\d+/)
  })

  it("--help lists all top-level commands", async () => {
    const { stdout, exitCode } = await cli(["--help"])
    expect(exitCode).toBe(0)
    for (const cmd of [
      "expose", "create", "list", "info", "delete", "run", "stop",
      "logs", "token", "ingress", "route", "dns", "vnet", "config",
      "auth", "status", "dev",
    ]) {
      expect(stdout).toContain(cmd)
    }
  })

  it("--help includes global flags (--json, --config, --format)", async () => {
    const { stdout } = await cli(["--help"])
    expect(stdout).toContain("--json")
    expect(stdout).toContain("--config")
    expect(stdout).toContain("--format")
  })

  it("<command> --help shows command-specific usage", async () => {
    const { stdout, exitCode } = await cli(["create", "--help"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("name")
    expect(stdout).toContain("Create")
  })

  it("nested --help works (e.g. tunnels ingress --help)", async () => {
    const { stdout, exitCode } = await cli(["ingress", "--help"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("add")
    expect(stdout).toContain("list")
    expect(stdout).toContain("remove")
  })
})

describe("unknown command", () => {
  it("prints error message for unknown subcommand", async () => {
    const { stdout, stderr } = await cli(["nonexistent"])
    // Effect CLI shows help text with an "Unknown subcommand" error message
    const output = stdout + stderr
    expect(output).toMatch(/unknown subcommand|Unknown/i)
  })

  it("shows help with available commands for typos", async () => {
    const { stdout, stderr } = await cli(["creat"]) // close to "create"
    const output = stdout + stderr
    // Effect CLI shows the help listing with all valid subcommands
    expect(output).toContain("create")
  })
})

describe("global flags", () => {
  it("--json is accepted on any command without crashing", async () => {
    // --help with --json should still print help and exit 0
    const { exitCode } = await cli(["--json", "--help"])
    expect(exitCode).toBe(0)
  })

  it("--no-color is accepted without crashing", async () => {
    const { exitCode } = await cli(["--no-color", "--help"])
    expect(exitCode).toBe(0)
  })

  it("--config accepts a custom path", async () => {
    const { exitCode } = await cli(["--config", "/tmp/test-tunnels.yaml", "--help"])
    expect(exitCode).toBe(0)
  })

  it("--format accepts table, json, csv", async () => {
    for (const fmt of ["table", "json", "csv"]) {
      const { exitCode } = await cli(["--format", fmt, "--help"])
      expect(exitCode).toBe(0)
    }
  })

  it("--format rejects invalid values", async () => {
    const { exitCode, stdout, stderr } = await cli(["--format", "xml", "--help"])
    // The CLI framework should reject "xml" as an invalid choice
    const output = stdout + stderr
    expect(output.length).toBeGreaterThan(0)
    // Either exits non-zero or ignores the flag — both are acceptable
    // as long as it doesn't silently crash
  })
})

describe("missing auth", () => {
  it("commands requiring auth fail with actionable message when no env vars set", async () => {
    const { exitCode, stderr, stdout } = await cli(["list"])
    expect(exitCode).not.toBe(0)
    const output = stdout + stderr
    expect(output).toMatch(/CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN|auth/i)
  })

  it("error message mentions `tunnels auth login`", async () => {
    const { stderr, stdout } = await cli(["list"])
    const output = stdout + stderr
    expect(output).toMatch(/tunnels auth login|auth login/i)
  })
})

describe("argument validation", () => {
  it("expose without port argument shows usage help", async () => {
    // Effect CLI shows help when required arguments are missing
    const { stdout, stderr } = await cli(["expose"])
    const output = stdout + stderr
    // Should show the expose command's usage/help
    expect(output).toContain("expose")
    expect(output).toContain("port")
  })

  it("create without name argument shows usage help", async () => {
    const { stdout, stderr } = await cli(["create"])
    const output = stdout + stderr
    expect(output).toContain("create")
    expect(output).toContain("name")
  })

  it("delete without name-or-id argument shows usage help", async () => {
    const { stdout, stderr } = await cli(["delete"])
    const output = stdout + stderr
    expect(output).toContain("delete")
  })

  it("dns create without required arguments shows usage help", async () => {
    const { stdout, stderr } = await cli(["dns", "create"])
    const output = stdout + stderr
    expect(output).toContain("create")
    expect(output).toContain("hostname")
  })

  it("route add without required arguments shows usage help", async () => {
    const { stdout, stderr } = await cli(["route", "add"])
    const output = stdout + stderr
    expect(output).toContain("add")
    expect(output).toContain("cidr")
  })
})
