import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter, Readable } from "node:stream"
import { expose } from "./expose.js"
import { spawn } from "node:child_process"
import { cloudflared } from "./bin/cloudflared.js"

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}))

vi.mock("./bin/cloudflared.js", () => ({
  cloudflared: {
    path: "/mock/cloudflared",
    isInstalled: vi.fn().mockResolvedValue(true),
    install: vi.fn().mockResolvedValue(undefined),
  },
}))

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

  beforeEach(() => {
    mockProc = createMockProcess()
    vi.mocked(spawn).mockReturnValue(mockProc)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("exposes a port and returns the tunnel URL", async () => {
    const tunnelPromise = expose(3000)

    // Simulate cloudflared outputting the URL
    setTimeout(() => {
      mockProc.stderr.push(
        "INF |  https://test-tunnel-abc123.trycloudflare.com\n",
      )
    }, 10)

    const tunnel = await tunnelPromise

    expect(tunnel.url).toBe("https://test-tunnel-abc123.trycloudflare.com")
    expect(spawn).toHaveBeenCalledWith(
      "/mock/cloudflared",
      ["tunnel", "--url", "http://localhost:3000"],
      expect.any(Object),
    )
  })

  it("close() kills the process", async () => {
    const tunnelPromise = expose(8080)

    setTimeout(() => {
      mockProc.stderr.push(
        "INF |  https://xyz789.trycloudflare.com\n",
      )
    }, 10)

    const tunnel = await tunnelPromise

    // Mock the process exiting on SIGTERM
    mockProc.kill.mockImplementation(() => {
      setTimeout(() => mockProc.emit("exit", 0), 5)
    })

    await tunnel.close()

    expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM")
  })

  it("rejects if process exits before providing URL", async () => {
    const tunnelPromise = expose(3000)

    setTimeout(() => {
      mockProc.emit("exit", 1)
    }, 10)

    await expect(tunnelPromise).rejects.toThrow("exited with code 1")
  })

  it("rejects if process errors", async () => {
    const tunnelPromise = expose(3000)

    setTimeout(() => {
      mockProc.emit("error", new Error("ENOENT"))
    }, 10)

    await expect(tunnelPromise).rejects.toThrow("Failed to start cloudflared")
  })

  it("installs binary if not already installed", async () => {
    vi.mocked(cloudflared.isInstalled).mockResolvedValueOnce(false)

    const tunnelPromise = expose(3000)

    setTimeout(() => {
      mockProc.stderr.push(
        "INF |  https://auto-install.trycloudflare.com\n",
      )
    }, 10)

    await tunnelPromise

    expect(cloudflared.install).toHaveBeenCalled()
  })

  it("supports Symbol.asyncDispose", async () => {
    const tunnelPromise = expose(3000)

    setTimeout(() => {
      mockProc.stderr.push(
        "INF |  https://disposable.trycloudflare.com\n",
      )
    }, 10)

    const tunnel = await tunnelPromise

    expect(tunnel[Symbol.asyncDispose]).toBeDefined()
    expect(typeof tunnel[Symbol.asyncDispose]).toBe("function")
  })
})
