import { EventEmitter } from "node:events"
import { Readable } from "node:stream"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TunnelProcess } from "./process.js"
import type { ProcessSpawner } from "./types.js"

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
  let spawner: ProcessSpawner

  beforeEach(() => {
    mockProc = createMockProcess()
    spawner = { spawn: vi.fn().mockReturnValue(mockProc) }
  })

  it("starts with inactive status", () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })
    expect(tp.status).toBe("inactive")
    expect(tp.connectors).toEqual([])
  })

  it("emits connected events from JSON log lines", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    const connected = new Promise<void>((resolve) => {
      tp.on("connected", (conn) => {
        expect(conn.id).toBe("0")
        expect(conn.location).toBe("bos01")
        resolve()
      })
    })

    mockProc.stderr.push(
      `${JSON.stringify({
        level: "info",
        event: "registered",
        connIndex: 0,
        location: "bos01",
        ip: "198.41.192.7",
      })}\n`,
    )

    await connected
  })

  it("also recognizes connection events from message text", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    const connected = new Promise<void>((resolve) => {
      tp.on("connected", (conn) => {
        expect(conn.id).toBe("1")
        resolve()
      })
    })

    mockProc.stderr.push(
      `${JSON.stringify({
        level: "info",
        message: "Registered tunnel connection",
        connIndex: 1,
        location: "iad01",
        ip: "198.41.192.8",
      })}\n`,
    )

    await connected
  })

  it("transitions to degraded when 1-3 connections, healthy at 4", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    const statuses: string[] = []
    tp.on("status", (status) => statuses.push(status))

    for (let i = 0; i < 4; i++) {
      mockProc.stderr.push(
        `${JSON.stringify({
          level: "info",
          event: "registered",
          connIndex: i,
          location: `colo${i}`,
          ip: `1.2.3.${i}`,
        })}\n`,
      )
    }

    await new Promise((resolve) => setTimeout(resolve, 25))

    expect(statuses).toContain("degraded")
    expect(statuses).toContain("healthy")
    expect(tp.status).toBe("healthy")
    expect(tp.connectors).toHaveLength(4)
  })

  it("emits metrics events", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    const metrics = new Promise<void>((resolve) => {
      tp.on("metrics", (value) => {
        expect(value.rps).toBe(12)
        expect(value.activeConns).toBe(4)
        resolve()
      })
    })

    mockProc.stderr.push(
      `${JSON.stringify({
        level: "info",
        rps: 12,
        p50Ms: 10,
        p99Ms: 25,
        activeConns: 4,
        bytesIn: 100,
        bytesOut: 200,
      })}\n`,
    )

    await metrics
  })

  it("emits error events from error-level logs", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    const errorEvent = new Promise<void>((resolve) => {
      tp.on("error", (error) => {
        expect(error.message).toContain("connection refused")
        expect(error.retryable).toBe(true)
        resolve()
      })
    })

    mockProc.stderr.push(
      `${JSON.stringify({
        level: "error",
        event: "error",
        error: "connection refused",
        message: "connection refused",
      })}\n`,
    )

    await errorEvent
  })

  it("emits exit event when process exits", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    const exitCode = new Promise<number>((resolve) => {
      tp.on("exit", (code) => resolve(code))
    })

    mockProc.emit("exit", 0)

    expect(await exitCode).toBe(0)
    expect(tp.status).toBe("down")
  })

  it("close() sends SIGTERM", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    mockProc.kill.mockImplementation(() => {
      setTimeout(() => mockProc.emit("exit", 0), 10)
    })

    await tp.close()

    expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM")
  })

  it("waitUntilHealthy resolves when 4 connections are made", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })
    const healthy = tp.waitUntilHealthy(5000)

    for (let i = 0; i < 4; i++) {
      mockProc.stderr.push(
        `${JSON.stringify({
          level: "info",
          event: "registered",
          connIndex: i,
          location: `colo${i}`,
          ip: `1.2.3.${i}`,
        })}\n`,
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
      spawner,
    })

    expect(spawner.spawn).toHaveBeenCalledWith(
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

  it("does NOT emit connected for 'unregistered' events (overlap bug regression)", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    mockProc.stderr.push(
      `${JSON.stringify({
        level: "info",
        event: "registered",
        connIndex: 0,
        location: "bos01",
        ip: "198.41.192.7",
      })}\n`,
    )

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(tp.connectors).toHaveLength(1)

    const events: string[] = []
    tp.on("connected", () => events.push("connected"))
    tp.on("disconnected", () => events.push("disconnected"))

    mockProc.stderr.push(
      `${JSON.stringify({
        level: "info",
        event: "unregistered",
        connIndex: 0,
        location: "bos01",
        ip: "198.41.192.7",
      })}\n`,
    )

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(events).toEqual(["disconnected"])
    expect(tp.connectors).toHaveLength(0)
  })

  it("does NOT emit connected for 'connectionUnregistered' events", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    mockProc.stderr.push(
      `${JSON.stringify({
        level: "info",
        event: "registered",
        connIndex: 1,
        location: "iad01",
        ip: "198.41.192.8",
      })}\n`,
    )

    await new Promise((resolve) => setTimeout(resolve, 10))

    const events: string[] = []
    tp.on("connected", () => events.push("connected"))
    tp.on("disconnected", () => events.push("disconnected"))

    mockProc.stderr.push(
      `${JSON.stringify({
        level: "info",
        event: "connectionUnregistered",
        connIndex: 1,
        location: "iad01",
        ip: "198.41.192.8",
      })}\n`,
    )

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(events).toEqual(["disconnected"])
  })

  it("does not emit error for lines containing 'err' as substring (e.g. stderr)", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    const errors: string[] = []
    tp.on("error", (e) => errors.push(e.message))

    mockProc.stderr.push("Starting stderr redirect\n")
    mockProc.stderr.push("Connecting to preferred endpoint\n")
    mockProc.stderr.push("ERR failed to connect\n")

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("ERR failed to connect")
  })

  it("waitUntilHealthy rejects on timeout", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    mockProc.stderr.push(
      `${JSON.stringify({
        level: "info",
        event: "registered",
        connIndex: 0,
        location: "bos01",
        ip: "198.41.192.7",
      })}\n`,
    )

    await expect(tp.waitUntilHealthy(50)).rejects.toThrow("Timed out")
  })

  it("waitUntilHealthy rejects if process exits before healthy", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })
    const healthy = tp.waitUntilHealthy(5000)

    mockProc.emit("exit", 1)

    await expect(healthy).rejects.toThrow("exited with code 1")
  })

  it("waitUntilHealthy resolves immediately if already healthy", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    for (let i = 0; i < 4; i++) {
      mockProc.stderr.push(
        `${JSON.stringify({
          level: "info",
          event: "registered",
          connIndex: i,
          location: `colo${i}`,
          ip: `1.2.3.${i}`,
        })}\n`,
      )
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(tp.status).toBe("healthy")

    await expect(tp.waitUntilHealthy()).resolves.toBeUndefined()
  })

  it("close() is idempotent", async () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })

    mockProc.kill.mockImplementation(() => {
      setTimeout(() => mockProc.emit("exit", 0), 5)
    })

    await tp.close()
    await tp.close()

    expect(mockProc.kill).toHaveBeenCalledTimes(1)
  })

  it("respects AbortSignal", async () => {
    const controller = new AbortController()

    mockProc.kill.mockImplementation(() => {
      setTimeout(() => mockProc.emit("exit", 0), 5)
    })

    TunnelProcess.start("/usr/bin/cloudflared", "test-token", {
      signal: controller.signal,
      spawner,
    })

    controller.abort()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM")
  })

  it("respects already-aborted signal", async () => {
    const controller = new AbortController()
    controller.abort()

    mockProc.kill.mockImplementation(() => {
      setTimeout(() => mockProc.emit("exit", 0), 5)
    })

    TunnelProcess.start("/usr/bin/cloudflared", "test-token", {
      signal: controller.signal,
      spawner,
    })

    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM")
  })

  it("exposes stderr via getter", () => {
    const tp = TunnelProcess.start("/usr/bin/cloudflared", "test-token", { spawner })
    expect(tp.stderr).toBe(mockProc.stderr)
  })
})
