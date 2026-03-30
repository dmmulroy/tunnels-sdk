/**
 * Tier 1: Binary management — no auth needed.
 *
 * Tests the real cloudflared binary download, caching, and version check.
 * First run downloads ~50MB; subsequent runs use cache.
 */
import { describe, it, expect } from "vitest"
import { ManagedRuntime } from "effect"
import { CloudflaredBinary } from "../../src/effect/services/CloudflaredBinary.js"
import { existsSync } from "node:fs"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

describe("CloudflaredBinary (real)", () => {
  let binaryPath: string

  it("ensureInstalled() downloads and returns a valid path", async () => {
    const runtime = ManagedRuntime.make(CloudflaredBinary.layer)
    try {
      binaryPath = await runtime.runPromise(
        CloudflaredBinary.use((b) => b.ensureInstalled()),
      )
      expect(typeof binaryPath).toBe("string")
      expect(existsSync(binaryPath)).toBe(true)
    } finally {
      await runtime.dispose()
    }
  }, 60_000) // first download can be slow

  it("cached binary runs `cloudflared --version`", async () => {
    expect(binaryPath).toBeDefined()
    const { stdout } = await execFileAsync(binaryPath, ["--version"])
    expect(stdout).toContain("cloudflared")
  })

  it("isInstalled() returns true after install", async () => {
    const runtime = ManagedRuntime.make(CloudflaredBinary.layer)
    try {
      const installed = await runtime.runPromise(
        CloudflaredBinary.use((b) => b.isInstalled()),
      )
      expect(installed).toBe(true)
    } finally {
      await runtime.dispose()
    }
  })

  it("second ensureInstalled() is fast (cached)", async () => {
    const runtime = ManagedRuntime.make(CloudflaredBinary.layer)
    try {
      const start = Date.now()
      await runtime.runPromise(
        CloudflaredBinary.use((b) => b.ensureInstalled()),
      )
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(2_000)
    } finally {
      await runtime.dispose()
    }
  })
})
