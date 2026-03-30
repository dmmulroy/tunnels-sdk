/**
 * Tier 2: Quick tunnel via CLI — no auth needed, real cloudflared binary.
 *
 * Spawns `tunnels expose <port>` as a child process, verifies the
 * trycloudflare URL appears in stdout, and verifies cleanup on SIGTERM.
 */
import { describe, it } from "vitest"

describe("tunnels expose (quick tunnel)", () => {
  it("prints a trycloudflare URL to stdout and exits 0 on SIGTERM")
  it("output contains the local port in the URL mapping line")
  it("process exits cleanly on SIGINT (ctrl-c)")
  it("exits non-zero when the port is not a valid number")
  it("exits non-zero when the port is out of range")
})

describe("tunnels expose --json", () => {
  it("outputs valid JSON with a url field")
  it("JSON url matches trycloudflare pattern")
})
