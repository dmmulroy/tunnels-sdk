/**
 * Tier 3: Ingress commands against real Cloudflare API.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 * Creates a tunnel, then tests ingress add/list/remove via CLI.
 */
import { describe, it } from "vitest"

describe("tunnels ingress add", () => {
  it("adds an ingress rule, prints confirmation, exits 0")
  it("--json outputs the created rule")
})

describe("tunnels ingress list", () => {
  it("lists ingress rules in table format with HOSTNAME, SERVICE columns")
  it("--json outputs a JSON array of ingress rules")
  it("empty ingress list prints header only (table) or empty array (json)")
})

describe("tunnels ingress remove", () => {
  it("removes an ingress rule by hostname, prints confirmation, exits 0")
  it("nonexistent hostname exits non-zero with error message")
})

describe("ingress add → list → remove lifecycle", () => {
  it("full add/list/remove cycle on a real tunnel")
})
