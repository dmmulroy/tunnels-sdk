# tunnels-cli

A modern CLI for Cloudflare Tunnels. One command to expose a local port to the internet.

```bash
tunnels expose 3000
# ⚡ Tunnel live → https://abc123.trycloudflare.com → localhost:3000
```

## Why not `cloudflared`?

| Problem | `cloudflared` | `tunnels` |
|---------|---------------|-------|
| Expose with custom domain | 4+ separate commands | `tunnels expose 3000 --hostname app.example.com` |
| Structured output | Log-style text | `--json` on everything |
| Config validation | Fails at runtime | `tunnels config validate` with actionable errors |
| CI/headless auth | Browser-only | `--token`, `--service-token` |
| Deep subcommands | `cloudflared tunnel route ip add ...` | `tunnels route add ...` |

## Install

```bash
# From the monorepo
pnpm install
pnpm build

# Run directly
node packages/cli/bin/tunnels.js --help
```

## Quick Start

```bash
# Anonymous quick tunnel — no auth needed
tunnels expose 3000

# With a custom domain (requires auth)
tunnels expose 3000 --hostname app.example.com

# Create and manage a named tunnel
tunnels tunnel create my-app --dns
tunnels tunnel run my-app

# Check health
tunnels status
```

## Commands

### `tunnels expose` — The One-Liner

Expose a local port through a Cloudflare Tunnel. Zero config, instant tunnel.

```bash
tunnels expose <port> [flags]
```

| Flag | Description |
|------|-------------|
| `--hostname` | Custom domain (requires auth) |
| `--protocol` | Protocol: `http` (default), `https`, `ssh`, `rdp`, `tcp` |
| `--cleanup` | Auto-cleanup DNS on exit |

**Without auth** — creates an anonymous quick tunnel with a random `*.trycloudflare.com` URL.
**With auth + `--hostname`** — creates a named tunnel, configures ingress, creates a DNS CNAME, and runs it. All in one command.

### `tunnels tunnel` — Named Tunnel Management

```bash
tunnels tunnel create <name> [--dns]       # Create a tunnel
tunnels tunnel list [--status <status>]    # List tunnels
tunnels tunnel info <name-or-id>           # Show tunnel details
tunnels tunnel run <name-or-id>            # Run a tunnel
tunnels tunnel stop <name-or-id>           # Stop a tunnel
tunnels tunnel delete <name-or-id> [--force]
tunnels tunnel logs <name-or-id>           # Stream logs
tunnels tunnel token <name-or-id>          # Get token for remote machines
```

### `tunnels ingress` — Ingress Rules

```bash
tunnels ingress add <hostname> <service> [--tunnel <name>]
tunnels ingress list [--tunnel <name>]
tunnels ingress remove <hostname> [--tunnel <name>]
```

A catch-all rule (`http_status:404`) is auto-added if missing. No more silent 502s.

### `tunnels route` — Private Network Routes

```bash
tunnels route add <cidr> --tunnel <name> [--vnet <name>]
tunnels route list [--tunnel <name>]
tunnels route remove <cidr>
```

### `tunnels dns` — DNS Management

```bash
tunnels dns create <hostname> --tunnel <name>   # Create CNAME
tunnels dns list                                 # List tunnel DNS records
tunnels dns remove <hostname>
```

### `tunnels vnet` — Virtual Networks

```bash
tunnels vnet create <name> [--default]
tunnels vnet list
tunnels vnet delete <name>
```

### `tunnels config` — Config File Management

```bash
tunnels config validate [--strict]    # Validate tunnels.yaml
tunnels config diff                   # Diff local vs remote
tunnels config push [--dry-run]       # Push to Cloudflare
tunnels config pull [--output <path>] # Pull from Cloudflare
tunnels config init                   # Interactive config setup
```

### `tunnels auth` — Authentication

```bash
tunnels auth login                    # Browser flow
tunnels auth login --token $TOKEN     # Headless / CI
tunnels auth status                   # Check auth
tunnels auth logout
```

### `tunnels status` — Health Check

```bash
tunnels status
# TUNNEL    STATUS    CONNS  UPTIME     COLO
# my-app    healthy   4/4    2d 14h     bos01, phl01
```

### `tunnels dev` — Development Mode *(coming soon)*

```bash
tunnels dev --port 3000               # Quick tunnel with watch
tunnels dev --watch                   # Auto-reload on config change
```

## Global Flags

Every command accepts these:

| Flag | Alias | Description |
|------|-------|-------------|
| `--json` | | Structured JSON output |
| `--quiet` | `-q` | Suppress non-essential output |
| `--verbose` | | Debug-level output |
| `--account-id <id>` | | Override Cloudflare account |
| `--config <path>` | | Config file path (default: `./tunnels.yaml`) |
| `--format <fmt>` | | Output format: `table`, `json`, `csv` |
| `--no-color` | | Disable colored output |
| `--no-interactive` | | Disable prompts (fail instead of asking) |

## Config File

`tunnels.yaml` — validated on every run with actionable errors.

```yaml
tunnel: my-app

ingress:
  - hostname: app.example.com
    service: http://localhost:3000
    origin:
      connectTimeout: 30s
      noTLSVerify: false

  - hostname: api.example.com
    service: http://localhost:8080

dns:
  auto: true       # auto-create CNAMEs on tunnel run
  cleanup: true    # remove DNS records on tunnel delete

routes:
  - network: 172.16.0.0/16
  - network: 10.0.0.0/8
    vnet: production
```

### Validation Rules

- Ingress must have at least one rule
- Catch-all auto-added if missing (error in `--strict` mode)
- Hostnames validated against the domain's zone
- Duplicate hostnames are an error
- Unknown keys are an error — no silent typos

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | User error (bad args, invalid config) |
| `2` | Authentication error |
| `3` | Network / API error |
| `4` | Tunnel runtime error |

## Architecture

Built with [Effect](https://effect.website) and the Effect CLI module. The codebase uses Effect's service pattern for testability — every external dependency (Cloudflare API, `cloudflared` binary, DNS) is behind a service interface with swappable live/test layers.

```
packages/cli/
├── bin/tunnels.ts      # Entry point
├── src/
│   ├── main.ts         # Root command + subcommand tree
│   ├── commands/       # One file per command group
│   ├── services.ts     # Service interfaces (QuickTunnel, TunnelApi, Ingress, ...)
│   ├── errors.ts       # Typed error variants → exit codes
│   ├── output.ts       # Table/JSON formatting + OutputContext
│   ├── live-layer.ts   # Real implementations (API calls, binary exec)
│   └── test-layer.ts   # In-memory fakes for unit tests
```

## Development

```bash
# Run tests
pnpm test

# Type check
pnpm typecheck

# Build
pnpm build
```

## License

MIT
