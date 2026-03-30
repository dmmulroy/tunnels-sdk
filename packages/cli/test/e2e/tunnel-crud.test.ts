/**
 * Tier 3: Tunnel CRUD commands against real Cloudflare API.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 * Spawns `tunnels create`, `tunnels list`, `tunnels info`, `tunnels delete`
 * and verifies stdout/stderr/exit codes.
 */
import { describe, it } from "vitest"

describe("tunnels create", () => {
  it("creates a tunnel, prints name and id, exits 0")
  it("with --dns flag creates tunnel and prints confirmation")
  it("with --json outputs valid JSON with id and name fields")
  it("duplicate name exits non-zero with actionable error")
})

describe("tunnels list", () => {
  it("lists tunnels in table format with NAME, STATUS, CONNS columns")
  it("--status filters results (only matching tunnels appear)")
  it("--json outputs a JSON array of tunnel objects")
  it("empty list prints header only (table) or empty array (json)")
})

describe("tunnels info", () => {
  it("shows tunnel details by name")
  it("shows tunnel details by ID")
  it("nonexistent tunnel exits non-zero with error message")
  it("--json outputs tunnel detail as JSON object")
})

describe("tunnels delete", () => {
  it("deletes a tunnel by name, prints confirmation, exits 0")
  it("--force deletes tunnel with active connections")
  it("nonexistent tunnel exits non-zero with error message")
})

describe("tunnels token", () => {
  it("prints a non-empty JWT token string for a valid tunnel")
  it("nonexistent tunnel exits non-zero")
})

describe("create → list → info → delete lifecycle", () => {
  it("full CRUD cycle via CLI commands with consistent output")
})
