/**
 * Tier 3: Route commands against real Cloudflare API.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 * Creates a tunnel, then tests route add/list/remove via CLI.
 */
import { describe, it } from "vitest"

describe("tunnels route add", () => {
  it("adds a private network route, prints confirmation, exits 0")
  it("invalid CIDR exits non-zero with error message")
})

describe("tunnels route list", () => {
  it("lists routes in table format with NETWORK, TUNNEL columns")
  it("--json outputs a JSON array of routes")
})

describe("tunnels route remove", () => {
  it("removes a route by CIDR, prints confirmation, exits 0")
  it("nonexistent route exits non-zero with error message")
})

describe("route add → list → remove lifecycle", () => {
  it("full add/list/remove cycle for a private network route")
})
