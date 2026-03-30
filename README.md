# tunnels

A modern Cloudflare Tunnel developer experience — a CLI (`tunnels`) and a TypeScript SDK (`tunnels`).

## Why

The current tooling splits the tunnel problem in two:

- **Official SDK** (`cloudflare` npm) — auto-generated REST wrapper. Deeply nested (`client.zeroTrust.tunnels.cloudflared.create(...)`), API-only, no process management.
- **Community wrapper** (`cloudflared` npm) — manages the binary via `child_process.spawn`. EventEmitter-based, no API integration, quick tunnels only.
- **`cloudflared` CLI** — deep nested subcommands, YAML config with silent footguns, no structured output, no `--dry-run`.

Nobody gives you the full picture. A modern tool treats the **full tunnel lifecycle** — auth → create → configure → DNS → run → monitor → teardown — as the unit of abstraction.

## What's Here

| Directory | Description |
|-----------|-------------|
| [`cli/`](./cli/README.md) | Design for `tunnels` — a modern CLI for Cloudflare Tunnels |
| [`lib/`](./lib/README.md) | Design for `tunnels` — a TypeScript SDK with top-notch DX |

## Design Principles

### Shared Across Both

1. **Lifecycle is the primitive** — create, configure, DNS, run, monitor, teardown are one flow, not 4+ separate API calls you stitch together.
2. **Zero-config quick path** — `tunnels expose 3000` / `expose(3000)` gets you a URL with nothing else.
3. **Full-config power path** — named tunnels, ingress rules, private networks, virtual networks, DNS management.
4. **Structured output** — JSON everywhere, typed everywhere. Machines can parse it, humans can read it.
5. **Fail with actionable errors** — catch-all rule missing? Say exactly what to add and where. Config typo? Show the line number and the valid options.
6. **Binary management is invisible** — auto-download, version-locked, cached. Never think about it.

### CLI-Specific

- **Interactive-first, flag-complete** — prompts guide you through complex flows; every prompt has a flag equivalent for CI.
- **Noun-verb pattern** — `tunnels tunnel create`, `tunnels route add`. Flat where possible.
- **`--json` on everything** — structured output for scripts, AI agents, piping.
- **Meaningful exit codes** — 0 success, 1 user error, 2 auth error, 3 network error.

### Library-Specific

- **Explicit Resource Management** — `await using t = await expose(3000)` — cleanup is automatic.
- **Async iterators for streaming** — logs, metrics, events. Backpressure-aware.
- **Zod-validated config** — catch misconfig at build time, not at deploy time.
- **Typed events** — no `on("connected", (data: any) => ...)`. Every event has a shape.
