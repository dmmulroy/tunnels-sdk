import { describe, expect, it } from "@effect/vitest"
import { formatJson, formatTable, type Column } from "./output.js"

const tunnels = [
  { name: "my-app", status: "healthy", connections: 4 },
  { name: "staging", status: "inactive", connections: 0 },
]

const columns: Column<typeof tunnels[number]>[] = [
  { header: "NAME", value: (r) => r.name },
  { header: "STATUS", value: (r) => r.status },
  { header: "CONNS", value: (r) => String(r.connections) },
]

describe("formatJson", () => {
  it("serializes data as indented JSON", () => {
    const result = formatJson(tunnels)
    expect(JSON.parse(result)).toEqual(tunnels)
    expect(result).toContain("\n")
  })

  it("handles a single object", () => {
    const result = formatJson(tunnels[0])
    expect(JSON.parse(result)).toEqual(tunnels[0])
  })
})

describe("formatTable", () => {
  it("produces aligned columns with headers", () => {
    const result = formatTable(tunnels, columns)
    const lines = result.split("\n")
    expect(lines[0]).toContain("NAME")
    expect(lines[0]).toContain("STATUS")
    expect(lines[0]).toContain("CONNS")
    expect(lines.length).toBe(3) // header + 2 rows
  })

  it("aligns columns so STATUS starts at the same position in every line", () => {
    const result = formatTable(tunnels, columns)
    const lines = result.split("\n")
    const statusPositions = lines.map((line) => line.indexOf("STATUS") >= 0
      ? line.indexOf("STATUS")
      : line.indexOf("healthy") >= 0
        ? line.indexOf("healthy")
        : line.indexOf("inactive")
    )
    expect(new Set(statusPositions).size).toBe(1)
  })

  it("handles empty data", () => {
    const result = formatTable([], columns)
    const lines = result.split("\n").filter(Boolean)
    expect(lines.length).toBe(1) // header only
  })
})
