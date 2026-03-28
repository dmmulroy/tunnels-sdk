import type { Readable } from "node:stream"
import { createInterface } from "node:readline"
import type { LogEntry } from "./types.js"

interface LogStreamOptions {
  /** Filter by log level */
  level?: "info" | "warn" | "error" | "debug"
  /** Filter to entries newer than this duration (e.g., "5m", "1h") */
  since?: string
  /** AbortSignal for cancellation */
  signal?: AbortSignal
}

/**
 * Async iterable log stream with filtering and backpressure.
 *
 * @example
 * ```ts
 * for await (const entry of new LogStream(stderr)) {
 *   console.log(entry.timestamp, entry.level, entry.message)
 * }
 * ```
 */
export class LogStream implements AsyncIterable<LogEntry> {
  private readonly source: Readable
  private readonly options: LogStreamOptions

  constructor(source: Readable, options: LogStreamOptions = {}) {
    this.source = source
    this.options = options
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<LogEntry> {
    const rl = createInterface({ input: this.source })
    const sinceDate = this.options.since ? parseSince(this.options.since) : null

    try {
      for await (const line of rl) {
        // Check abort
        if (this.options.signal?.aborted) break

        const entry = parseLine(line)
        if (!entry) continue

        // Apply filters
        if (this.options.level && entry.level !== this.options.level) continue
        if (sinceDate && entry.timestamp < sinceDate) continue

        yield entry
      }
    } finally {
      rl.close()
    }
  }

  /** Collect all entries into an array */
  async toArray(): Promise<LogEntry[]> {
    const entries: LogEntry[] = []
    for await (const entry of this) {
      entries.push(entry)
    }
    return entries
  }
}

/** Parse a single log line (JSON or unstructured) */
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
    // Unstructured log line
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
  const l = level.toLowerCase()
  if (l === "error" || l === "fatal" || l === "err") return "error"
  if (l === "warn" || l === "warning" || l === "wrn") return "warn"
  if (l === "debug" || l === "dbg" || l === "trace") return "debug"
  return "info"
}

/** Parse a duration string like "5m", "1h", "30s" into a Date in the past */
function parseSince(since: string): Date {
  const match = since.match(/^(\d+)\s*(s|m|h|d)$/)
  if (!match) throw new Error(`Invalid "since" duration: "${since}". Use e.g., "5m", "1h", "30s"`)

  const value = parseInt(match[1], 10)
  const unit = match[2]

  const ms: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  }

  return new Date(Date.now() - value * ms[unit])
}
