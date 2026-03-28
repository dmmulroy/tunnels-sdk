import { describe, it, expect } from "vitest"
import { Readable } from "node:stream"
import { LogStream } from "./logs.js"

function createStreamFromLines(lines: string[]): Readable {
  const stream = new Readable({ read() {} })
  for (const line of lines) {
    stream.push(line + "\n")
  }
  stream.push(null) // end of stream
  return stream
}

describe("LogStream", () => {
  it("parses JSON log lines", async () => {
    const stream = createStreamFromLines([
      JSON.stringify({
        time: "2025-02-18T10:00:00Z",
        level: "info",
        event: "connected",
        message: "Connection established",
        connIndex: 0,
      }),
      JSON.stringify({
        time: "2025-02-18T10:00:01Z",
        level: "error",
        event: "error",
        message: "Connection refused",
      }),
    ])

    const logs = new LogStream(stream)
    const entries = await logs.toArray()

    expect(entries).toHaveLength(2)
    expect(entries[0].level).toBe("info")
    expect(entries[0].message).toBe("Connection established")
    expect(entries[0].connectorId).toBe("0")
    expect(entries[1].level).toBe("error")
  })

  it("handles unstructured log lines", async () => {
    const stream = createStreamFromLines([
      "INF  Starting tunnel",
      "ERR  Something went wrong",
    ])

    const logs = new LogStream(stream)
    const entries = await logs.toArray()

    expect(entries).toHaveLength(2)
    expect(entries[0].level).toBe("info")
    expect(entries[1].level).toBe("error")
  })

  it("filters by level", async () => {
    const stream = createStreamFromLines([
      JSON.stringify({ time: "2025-02-18T10:00:00Z", level: "info", message: "Info msg" }),
      JSON.stringify({ time: "2025-02-18T10:00:01Z", level: "error", message: "Error msg" }),
      JSON.stringify({ time: "2025-02-18T10:00:02Z", level: "info", message: "Info msg 2" }),
    ])

    const logs = new LogStream(stream, { level: "error" })
    const entries = await logs.toArray()

    expect(entries).toHaveLength(1)
    expect(entries[0].message).toBe("Error msg")
  })

  it("supports abort signal", async () => {
    const stream = new Readable({ read() {} })
    const controller = new AbortController()

    // Push some lines
    stream.push(JSON.stringify({ level: "info", message: "line 1" }) + "\n")

    const logs = new LogStream(stream, { signal: controller.signal })

    const entries: unknown[] = []

    // Abort after collecting first entry
    setTimeout(() => {
      controller.abort()
      stream.push(null) // close the stream
    }, 50)

    for await (const entry of logs) {
      entries.push(entry)
    }

    expect(entries.length).toBeGreaterThanOrEqual(1)
  })

  it("normalizes log levels", async () => {
    const stream = createStreamFromLines([
      JSON.stringify({ level: "fatal", message: "Fatal" }),
      JSON.stringify({ level: "warning", message: "Warning" }),
      JSON.stringify({ level: "trace", message: "Trace" }),
    ])

    const logs = new LogStream(stream)
    const entries = await logs.toArray()

    expect(entries[0].level).toBe("error") // fatal → error
    expect(entries[1].level).toBe("warn") // warning → warn
    expect(entries[2].level).toBe("debug") // trace → debug
  })
})
