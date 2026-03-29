import { Effect } from "effect"
import { Command } from "effect/unstable/cli"
import { TunnelApiService, type TunnelInfo } from "../services.js"
import { printData, type Column } from "../output.js"

const statusColumns: ReadonlyArray<Column<TunnelInfo>> = [
  { header: "TUNNEL", value: (t) => t.name },
  { header: "STATUS", value: (t) => t.status ?? "unknown" },
  { header: "CONNS", value: (t) => {
    const cur = t.connections ?? 0
    const max = t.maxConnections
    return max != null ? `${cur}/${max}` : String(cur)
  }},
  { header: "UPTIME", value: (t) => t.uptime ?? "-" },
  { header: "COLO", value: (t) => t.colo ?? "-" },
]

export const status = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const api = yield* TunnelApiService
    const tunnels = yield* api.list()
    yield* printData(tunnels, statusColumns)
  })
).pipe(
  Command.withDescription("Quick health check for all tunnels")
)
