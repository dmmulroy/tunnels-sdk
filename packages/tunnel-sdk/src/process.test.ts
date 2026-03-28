import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EventEmitter, Readable } from "node:stream"
import { TunnelProcess } from "./process.js"
import { spawn } from "node:child_process"

// We test the log parsing logic by creating a mock process
// TunnelProcess.start() calls spawn() — we mock that

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
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
  proc.stdio = [null, stdout, stderr]
  return proc
}

describe("TunnelProcess", () => {
  let mockProc: ReturnType<typeof createMockProcess>

  beforeEach(() => {
    mockProc = createMockProcess()
    vi.mocked(spawn).mockReturnValue(mockProc)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("starts with inactive status", () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token")
    expect(tp.status).toBe("inactive")
    expect(tp.connectors).toEqual([])
  })

  it("emits connected events from JSON log lines", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token")

    const connected = new Promise<void>((resolve) => {
      tp.on("connected", (conn) => {
        expect(conn.id).toBe("0")
        expect(conn.location).toBe("bos01")
        resolve()
      })
    })

    // Simulate cloudflared JSON log output
    mockProc.stderr.push(
      JSON.stringify({
        level: "info",
        event: "registered",
        connIndex: 0,
        location: "bos01",
        ip: "198.41.192.7",
      }) + "\n",
    )

    await connected
  })

  it("transitions to degraded when 1-3 connections, healthy at 4", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token")

    const statuses: string[] = []
    tp.on("status", (s) => statuses.push(s))

    for (let i = 0; i < 4; i++) {
      mockProc.stderr.push(
        JSON.stringify({
          level: "info",
          event: "registered",
          connIndex: i,
          location: `colo${i}`,
          ip: `1.2.3.${i}`,
        }) + "\n",
      )
    }

    // Give time for events to process
    await new Promise((r) => setTimeout(r, 50))

    expect(statuses).toContain("degraded")
    expect(statuses).toContain("healthy")
    expect(tp.status).toBe("healthy")
    expect(tp.connectors).toHaveLength(4)
  })

  it("emits error events from error-level logs", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token")

    const errorEvent = new Promise<void>((resolve) => {
      tp.on("error", (err) => {
        expect(err.message).toContain("connection refused")
        expect(err.retryable).toBe(true)
        resolve()
      })
    })

    mockProc.stderr.push(
      JSON.stringify({
        level: "error",
        event: "error",
        error: "connection refused",
        message: "connection refused",
      }) + "\n",
    )

    await errorEvent
  })

  it("emits exit event when process exits", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token")

    const exitCode = new Promise<number>((resolve) => {
      tp.on("exit", (code) => resolve(code))
    })

    mockProc.emit("exit", 0)

    expect(await exitCode).toBe(0)
    expect(tp.status).toBe("down")
  })

  it("close() sends SIGTERM", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token")

    // Simulate the process exiting after SIGTERM
    mockProc.kill.mockImplementation(() => {
      setTimeout(() => mockProc.emit("exit", 0), 10)
    })

    await tp.close()

    expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM")
  })

  it("waitUntilHealthy resolves when 4 connections are made", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token")

    // Start waiting
    const healthy = tp.waitUntilHealthy(5000)

    // Simulate 4 connections
    for (let i = 0; i < 4; i++) {
      mockProc.stderr.push(
        JSON.stringify({
          level: "info",
          event: "registered",
          connIndex: i,
          location: `colo${i}`,
          ip: `1.2.3.${i}`,
        }) + "\n",
      )
    }

    await expect(healthy).resolves.toBeUndefined()
  })

  it("passes correct args to spawn", () => {
    TunnelProcess.start("/usr/bin/cloudflared", "test-token", {
      logLevel: "debug",
      metrics: "localhost:12345",
      gracePeriod: "60s",
      retries: 10,
    })

    expect(spawn).toHaveBeenCalledWith(
      "/usr/bin/cloudflared",
      [
        "tunnel",
        "--no-autoupdate",
        "run",
        "--token",
        "test-token",
        "--loglevel",
        "debug",
        "--metrics",
        "localhost:12345",
        "--grace-period",
        "60s",
        "--retries",
        "10",
      ],
      expect.any(Object),
    )
  })
})
