/**
 * Tier 1: CLI chrome — help, version, flags, error handling.
 *
 * No auth needed. No cloudflared binary needed. Pure CLI behavior.
 * Spawns the real `tunnels` binary and checks stdout/stderr/exit codes.
 */
import { describe, it } from "vitest"

describe("help & version", () => {
  it("--version prints semver and exits 0")
  it("--help lists all top-level commands")
  it("--help includes global flags (--json, --config, --format)")
  it("<command> --help shows command-specific usage")
  it("nested --help works (e.g. tunnels ingress --help)")
})

describe("unknown command", () => {
  it("prints error and exits non-zero for unknown subcommand")
  it("suggests closest match for typos")
})

describe("global flags", () => {
  it("--json is accepted on any command without crashing")
  it("--no-color is accepted without crashing")
  it("--config accepts a custom path")
  it("--format accepts table, json, csv")
  it("--format rejects invalid values")
})

describe("missing auth", () => {
  it("commands requiring auth fail with exit code 2 and actionable message when no env vars set")
  it("error message mentions `tunnels auth login`")
})

describe("argument validation", () => {
  it("expose without port argument prints usage and exits non-zero")
  it("create without name argument prints usage and exits non-zero")
  it("delete without name-or-id argument prints usage and exits non-zero")
  it("dns create without required arguments prints usage and exits non-zero")
  it("route add without required arguments prints usage and exits non-zero")
})
