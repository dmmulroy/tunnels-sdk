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
| [`cli/`](./cli/README.md) | CLI docs for the current `tunnels` command surface |
| [`lib/`](./lib/README.md) | SDK docs for the current async wrapper |

## Design Principles

### Shared Across Both

1. **Lifecycle is the primitive** — create, configure, DNS, run, monitor, teardown live in one package.
2. **Zero-config quick path** — `tunnels expose 3000` / `expose(3000)` gets you a URL with nothing else.
3. **Full-config power path** — named tunnels, ingress rules, private networks, virtual networks, DNS management.
4. **Structured output** — JSON everywhere, typed everywhere. Machines can parse it, humans can read it.
5. **Fail with actionable errors** — catch-all rule missing? Say exactly what to add and where. Config typo? Show the line number and the valid options.
6. **Binary management is invisible** — auto-download, version-locked, cached. Never think about it.

### CLI-Specific

- **Flat tunnel commands** — `tunnels create`, `tunnels list`, and grouped subcommands for ingress, DNS, routes, and VNets.
- **`--json` on everything** — structured output for scripts, AI agents, piping.
- **Meaningful exit codes** — 0 success, 1 user error, 2 auth error, 3 network error, 4 runtime error.

### Library-Specific

- **Explicit Resource Management** — `await using t = await expose(3000)` — cleanup is automatic.
- **Async iterators where exposed** — `listAll()` streams paginated tunnel metadata.
- **Config validation** — catch misconfig before deploy.
- **Typed resource managers** — manage tunnels, ingress, DNS, routes, and VNets without raw REST calls.
