import { Console, Effect, ServiceMap } from "effect"

// --- Column & formatting ---

/**
 * Column definition used by table output formatting.
 *
 * @template T Row type rendered by the column.
 */
export interface Column<T> {
  readonly header: string
  readonly value: (row: T) => string
}

/**
 * Formats a value as pretty-printed JSON.
 *
 * @param data Value to serialize.
 * @returns JSON string with two-space indentation.
 */
export const formatJson = (data: unknown): string =>
  JSON.stringify(data, null, 2)

/**
 * Formats rows as a padded text table.
 *
 * @template T Row type rendered by the table.
 * @param rows Rows to render.
 * @param columns Column definitions used to render each row.
 * @returns Plain-text table output.
 */
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

/**
 * Supported CLI output format.
 */
export type OutputFormat = "table" | "json" | "csv"

/**
 * Output settings supplied to CLI command handlers.
 */
export interface OutputContext {
  readonly format: OutputFormat
  readonly json: boolean
  readonly quiet: boolean
}

/**
 * Service tag carrying CLI output settings.
 */
export const OutputContext = ServiceMap.Service<OutputContext>("tunnels-cli/OutputContext")

/**
 * Default output settings for command handlers.
 */
export const defaultOutputContext: OutputContext = {
  format: "table",
  json: false,
  quiet: false,
}

/**
 * Prints rows as table or JSON depending on `OutputContext`.
 *
 * @template T Row type rendered by the table.
 * @param rows Rows to print.
 * @param columns Column definitions used for table output.
 * @returns An Effect that writes formatted output.
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
 * Prints a single object as JSON or key/value pairs.
 *
 * @param data Object to print.
 * @param fields Fields to include in human-readable output.
 * @returns An Effect that writes formatted output.
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
 * Prints a result as JSON or human-readable text.
 *
 * @param data Structured result data for JSON output.
 * @param text Human-readable message for text output.
 * @returns An Effect that writes formatted output.
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
