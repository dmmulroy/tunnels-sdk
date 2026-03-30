/**
 * Tier 4: Full named tunnel lifecycle via CLI — the most expensive test.
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CFT_TEST_ZONE
 * Runs real cloudflared, creates real Cloudflare resources, sends real HTTP traffic.
 *
 * This is the CLI equivalent of the SDK's named-tunnel e2e test, but
 * everything goes through the `tunnels` binary — no SDK imports.
 */
import { describe, it } from "vitest"

describe("full lifecycle via CLI", () => {
  it("create → ingress add → dns create → run → status shows healthy → stop → delete")

  it("expose --hostname does full setup in one command and cleans up on SIGTERM")
})

describe("error recovery", () => {
  it("delete --force cleans up a tunnel that was left in a bad state")
  it("creating a tunnel that already exists gives an actionable error, doesn't corrupt state")
})

describe("output consistency", () => {
  it("every mutating command (create, delete, add, remove) prints a confirmation line to stdout")
  it("--json output is valid JSON for every command in the lifecycle")
  it("exit code is 0 for all successful commands in the lifecycle")
  it("stderr is empty for all successful commands in the lifecycle")
})
