/**
 * Tier 3: DNS commands against real Cloudflare API.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CFT_TEST_ZONE
 * Creates a tunnel, then tests dns create/list/remove via CLI.
 */
import { describe, it } from "vitest"

describe("tunnels dns create", () => {
  it("creates a CNAME record, prints confirmation, exits 0")
  it("--json outputs the created record")
})

describe("tunnels dns list", () => {
  it("lists DNS records in table format with HOSTNAME, TUNNEL columns")
  it("--json outputs a JSON array of DNS records")
})

describe("tunnels dns remove", () => {
  it("removes a DNS record by hostname, prints confirmation, exits 0")
  it("nonexistent hostname exits non-zero with error message")
})

describe("dns create → list → remove lifecycle", () => {
  it("full create/list/remove cycle for a CNAME record")
})
