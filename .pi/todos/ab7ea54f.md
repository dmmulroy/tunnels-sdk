{
  "id": "ab7ea54f",
  "title": "Streaming logs: async iterators for tunnel log output",
  "tags": [
    "sdk",
    "feature"
  ],
  "status": "closed",
  "created_at": "2026-03-28T23:16:32.744Z"
}

Implement async iterator-based log streaming from running tunnels.

## Deliverables
- `src/logs.ts` — `LogStream` async iterable class
- Reads from cloudflared process stderr (JSON log lines)
- Supports filtering: `level`, `since`, `signal`
- `toArray()` helper for collecting
- Backpressure-aware (doesn't buffer unboundedly)
- `LogEntry` type: timestamp, level, event, message, connectorId, extras

## API
```ts
for await (const entry of tunnel.logs()) {
  console.log(entry.timestamp, entry.level, entry.message)
}

for await (const entry of tunnel.logs({ level: "error", since: "5m" })) {
  alertSlack(entry)
}

const errors = await tunnel.logs({ level: "error", since: "1h" }).toArray()
```

## Dependencies on
- TODO: Tunnel.run() + typed events
