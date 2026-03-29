import { createInterface } from "node:readline"
import type { Readable } from "node:stream"

export interface LogEntry {
  timestamp: Date
  level: "info" | "warn" | "error" | "debug"
  event: string
  message: string
  connectorId?: string
  [key: string]: unknown
}

interface LogStreamOptions {
  level?: "info" | "warn" | "error" | "debug"
  since?: string
  signal?: AbortSignal
}

export class LogStream implements AsyncIterable<LogEntry> {
  constructor(
    private readonly source: Readable,
    private readonly options: LogStreamOptions = {},
  ) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<LogEntry> {
    const lines = createInterface({ input: this.source })
    const sinceDate = this.options.since ? parseSince(this.options.since) : null

    try {
      for await (const line of lines) {
        if (this.options.signal?.aborted) break

        const entry = parseLine(line)
        if (!entry) continue
        if (this.options.level && entry.level !== this.options.level) continue
        if (sinceDate && entry.timestamp < sinceDate) continue

        yield entry
      }
    } finally {
      lines.close()
    }
  }

  async toArray(): Promise<LogEntry[]> {
    const entries: LogEntry[] = []
    for await (const entry of this) {
      entries.push(entry)
    }
    return entries
  }
}

function parseLine(line: string): LogEntry | null {
  try {
    const data = JSON.parse(line)
    return {
      ...data,
      timestamp: new Date(data.time ?? data.timestamp ?? Date.now()),
      level: normalizeLevel(data.level ?? "info"),
      event: String(data.event ?? data.msg ?? ""),
      message: String(data.message ?? data.msg ?? data.event ?? ""),
      connectorId: data.connIndex !== undefined ? String(data.connIndex) : undefined,
    }
  } catch {
    const level = line.includes("ERR")
      ? "error"
      : line.includes("WRN")
        ? "warn"
        : line.includes("DBG")
          ? "debug"
          : "info"

    return {
      timestamp: new Date(),
      level,
      event: "",
      message: line.trim(),
    }
  }
}

function normalizeLevel(level: string): LogEntry["level"] {
  const normalized = level.toLowerCase()
  if (normalized === "error" || normalized === "fatal" || normalized === "err") return "error"
  if (normalized === "warn" || normalized === "warning" || normalized === "wrn") return "warn"
  if (normalized === "debug" || normalized === "dbg" || normalized === "trace") return "debug"
  return "info"
}

function parseSince(since: string): Date {
  const match = since.match(/^(\d+)\s*(s|m|h|d)$/)
  if (!match) {
    throw new Error(`Invalid "since" duration: "${since}". Use e.g., "5m", "1h", "30s"`)
  }

  const value = Number.parseInt(match[1], 10)
  const unit = match[2]
  const unitToMs: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  }

  return new Date(Date.now() - value * unitToMs[unit])
}
