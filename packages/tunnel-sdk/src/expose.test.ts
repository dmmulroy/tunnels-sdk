import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { expose } from "./expose.js"
import type { BinaryResolver } from "./bin/index.js"
import type { ProcessSpawner } from "./process.js"

function createMockProcess() {
  const stderr = new Readable({ read() {} })
  const stdout = new Readable({ read() {} })
  const proc = new EventEmitter() as any
  proc.stderr = stderr
  proc.stdout = stdout
  proc.stdin = null
  proc.pid = 12345
  proc.kill = vi.fn()
  return proc
}

describe("expose", () => {
  let mockProc: ReturnType<typeof createMockProcess>
  let spawner: ProcessSpawner
  let binaryResolver: BinaryResolver

  beforeEach(() => {
    mockProc = createMockProcess()
    spawner = { spawn: vi.fn().mockReturnValue(mockProc) }
    binaryResolver = {
      path: "/mock/cloudflared",
      isInstalled: vi.fn().mockResolvedValue(true),
      install: vi.fn().mockResolvedValue(undefined),
    }
  })

  it("exposes a port and returns the tunnel URL", async () => {
    const tunnelPromise = expose(3000, { spawner, binaryResolver })

    setTimeout(() => {
      mockProc.stderr.push("INF |  https://test-tunnel-abc123.trycloudflare.com\n")
    }, 10)

    const tunnel = await tunnelPromise

    expect(tunnel.url).toBe("https://test-tunnel-abc123.trycloudflare.com")
    expect(spawner.spawn).toHaveBeenCalledWith(
      "/mock/cloudflared",
      ["tunnel", "--url", "http://localhost:3000"],
      expect.any(Object),
    )
  })

  it("respects a custom binary path without attempting install", async () => {
    const tunnelPromise = expose(3000, {
      binaryPath: "/custom/cloudflared",
      spawner,
      binaryResolver,
    })

    setTimeout(() => {
      mockProc.stderr.push("INF |  https://custom-bin.trycloudflare.com\n")
    }, 10)

    await tunnelPromise

    expect(spawner.spawn).toHaveBeenCalledWith(
      "/custom/cloudflared",
      ["tunnel", "--url", "http://localhost:3000"],
      expect.any(Object),
    )
    expect(binaryResolver.isInstalled).not.toHaveBeenCalled()
    expect(binaryResolver.install).not.toHaveBeenCalled()
  })

  it("close() kills the process", async () => {
    const tunnelPromise = expose(8080, { spawner, binaryResolver })

    setTimeout(() => {
      mockProc.stderr.push("INF |  https://xyz789.trycloudflare.com\n")
    }, 10)

    const tunnel = await tunnelPromise

    mockProc.kill.mockImplementation(() => {
      setTimeout(() => mockProc.emit("exit", 0), 5)
    })

    await tunnel.close()

    expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM")
  })

  it("rejects if process exits before providing URL", async () => {
    const tunnelPromise = expose(3000, { spawner, binaryResolver })

    setTimeout(() => {
      mockProc.emit("exit", 1)
    }, 10)

    await expect(tunnelPromise).rejects.toThrow("exited with code 1")
  })

  it("rejects if process errors", async () => {
    const tunnelPromise = expose(3000, { spawner, binaryResolver })

    setTimeout(() => {
      mockProc.emit("error", new Error("ENOENT"))
    }, 10)

    await expect(tunnelPromise).rejects.toThrow("Failed to start cloudflared")
  })

  it("installs binary if not already installed", async () => {
    binaryResolver.isInstalled = vi.fn().mockResolvedValue(false)

    const tunnelPromise = expose(3000, { spawner, binaryResolver })

    setTimeout(() => {
      mockProc.stderr.push("INF |  https://auto-install.trycloudflare.com\n")
    }, 10)

    await tunnelPromise

    expect(binaryResolver.install).toHaveBeenCalled()
  })

  it("supports Symbol.asyncDispose", async () => {
    const tunnelPromise = expose(3000, { spawner, binaryResolver })

    setTimeout(() => {
      mockProc.stderr.push("INF |  https://disposable.trycloudflare.com\n")
    }, 10)

    const tunnel = await tunnelPromise

    expect(tunnel[Symbol.asyncDispose]).toBeDefined()
    expect(typeof tunnel[Symbol.asyncDispose]).toBe("function")
  })
})
