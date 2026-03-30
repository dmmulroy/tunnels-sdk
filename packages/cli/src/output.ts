import { Console, Effect, ServiceMap } from "effect"

// --- Column & formatting ---

export interface Column<T> {
  readonly header: string
  readonly value: (row: T) => string
}

export const formatJson = (data: unknown): string =>
  JSON.stringify(data, null, 2)

export const formatTable = <T>(
  rows: ReadonlyArray<T>,
  columns: ReadonlyArray<Column<T>>
): string => {
  const widths = columns.map((col) =>
    Math.max(
      col.header.length,
      ...rows.map((row) => col.value(row).length)
    )
  )

  const pad = (value: string, width: number) => value.padEnd(width)

  const header = columns
    .map((col, i) => pad(col.header, widths[i]))
    .join("  ")

  const body = rows.map((row) =>
    columns
      .map((col, i) => pad(col.value(row), widths[i]))
      .join("  ")
  )

  return [header, ...body].join("\n")
}

// --- OutputContext service ---
// Carries global flag values (--json, --format, --quiet) into handlers.

export type OutputFormat = "table" | "json" | "csv"

export interface OutputContext {
  readonly format: OutputFormat
  readonly json: boolean
  readonly quiet: boolean
}

export const OutputContext = ServiceMap.Service<OutputContext>("tunnels-cli/OutputContext")

/** Default output context (table, not quiet) */
export const defaultOutputContext: OutputContext = {
  format: "table",
  json: false,
  quiet: false,
}

/**
 * Print data as table or JSON depending on OutputContext.
 * Falls back to table format if OutputContext is not provided.
 */
export const printData = <T>(
  rows: ReadonlyArray<T>,
  columns: ReadonlyArray<Column<T>>
): Effect.Effect<void, never, OutputContext> =>
  Effect.gen(function* () {
    const ctx = yield* OutputContext
    if (ctx.json || ctx.format === "json") {
      yield* Console.log(formatJson(rows))
    } else {
      yield* Console.log(formatTable(rows, columns))
    }
  })

/**
 * Print a single object — JSON or key/value pairs.
 */
export const printSingle = (
  data: Record<string, unknown>,
  fields: ReadonlyArray<{ label: string; key: string }>,
): Effect.Effect<void, never, OutputContext> =>
  Effect.gen(function* () {
    const ctx = yield* OutputContext
    if (ctx.json || ctx.format === "json") {
      yield* Console.log(formatJson(data))
    } else {
      const maxLabel = Math.max(...fields.map((f) => f.label.length))
      const lines = fields.map(
        (f) => `${f.label.padEnd(maxLabel)}  ${String(data[f.key] ?? "-")}`,
      )
      yield* Console.log(lines.join("\n"))
    }
  })

/**
 * Print a confirmation/result message — JSON or human text.
 */
export const printResult = (
  data: Record<string, unknown>,
  text: string,
): Effect.Effect<void, never, OutputContext> =>
  Effect.gen(function* () {
    const ctx = yield* OutputContext
    if (ctx.json || ctx.format === "json") {
      yield* Console.log(formatJson(data))
    } else {
      yield* Console.log(text)
    }
  })
