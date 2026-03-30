# cft

A modern CLI for Cloudflare Tunnels. One command to expose a local port to the internet.

```bash
cft expose 3000
# ⚡ Tunnel live → https://abc123.trycloudflare.com → localhost:3000
```

## Why not `cloudflared`?

| Problem | `cloudflared` | `cft` |
|---------|---------------|-------|
| Expose with custom domain | 4+ separate commands | `cft expose 3000 --hostname app.example.com` |
| Structured output | Log-style text | `--json` on everything |
| Config validation | Fails at runtime | `cft config validate` with actionable errors |
| CI/headless auth | Browser-only | `--token`, `--service-token` |
| Deep subcommands | `cloudflared tunnel route ip add ...` | `cft route add ...` |

## Install

```bash
# From the monorepo
pnpm install
pnpm build

# Run directly
node packages/cft/bin/cft.js --help
```

## Quick Start

```bash
# Anonymous quick tunnel — no auth needed
cft expose 3000

# With a custom domain (requires auth)
cft expose 3000 --hostname app.example.com

# Create and manage a named tunnel
cft tunnel create my-app --dns
cft tunnel run my-app

# Check health
cft status
```

## Commands

### `cft expose` — The One-Liner

Expose a local port through a Cloudflare Tunnel. Zero config, instant tunnel.

```bash
cft expose <port> [flags]
```

| Flag | Description |
|------|-------------|
| `--hostname` | Custom domain (requires auth) |
| `--protocol` | Protocol: `http` (default), `https`, `ssh`, `rdp`, `tcp` |
| `--cleanup` | Auto-cleanup DNS on exit |

**Without auth** — creates an anonymous quick tunnel with a random `*.trycloudflare.com` URL.
**With auth + `--hostname`** — creates a named tunnel, configures ingress, creates a DNS CNAME, and runs it. All in one command.

### `cft tunnel` — Named Tunnel Management

```bash
cft tunnel create <name> [--dns]       # Create a tunnel
cft tunnel list [--status <status>]    # List tunnels
cft tunnel info <name-or-id>           # Show tunnel details
cft tunnel run <name-or-id>            # Run a tunnel
cft tunnel stop <name-or-id>           # Stop a tunnel
cft tunnel delete <name-or-id> [--force]
cft tunnel logs <name-or-id>           # Stream logs
cft tunnel token <name-or-id>          # Get token for remote machines
```

### `cft ingress` — Ingress Rules

```bash
cft ingress add <hostname> <service> [--tunnel <name>]
cft ingress list [--tunnel <name>]
cft ingress remove <hostname> [--tunnel <name>]
```

A catch-all rule (`http_status:404`) is auto-added if missing. No more silent 502s.

### `cft route` — Private Network Routes

```bash
cft route add <cidr> --tunnel <name> [--vnet <name>]
cft route list [--tunnel <name>]
cft route remove <cidr>
```

### `cft dns` — DNS Management

```bash
cft dns create <hostname> --tunnel <name>   # Create CNAME
cft dns list                                 # List tunnel DNS records
cft dns remove <hostname>
```

### `cft vnet` — Virtual Networks

```bash
cft vnet create <name> [--default]
cft vnet list
cft vnet delete <name>
```

### `cft config` — Config File Management

```bash
cft config validate [--strict]    # Validate cft.yaml
cft config diff                   # Diff local vs remote
cft config push [--dry-run]       # Push to Cloudflare
cft config pull [--output <path>] # Pull from Cloudflare
cft config init                   # Interactive config setup
```

### `cft auth` — Authentication

```bash
cft auth login                    # Browser flow
cft auth login --token $TOKEN     # Headless / CI
cft auth status                   # Check auth
cft auth logout
```

### `cft status` — Health Check

```bash
cft status
# TUNNEL    STATUS    CONNS  UPTIME     COLO
# my-app    healthy   4/4    2d 14h     bos01, phl01
```

### `cft dev` — Development Mode *(coming soon)*

```bash
cft dev --port 3000               # Quick tunnel with watch
cft dev --watch                   # Auto-reload on config change
```

## Global Flags

Every command accepts these:

| Flag | Alias | Description |
|------|-------|-------------|
| `--json` | | Structured JSON output |
| `--quiet` | `-q` | Suppress non-essential output |
| `--verbose` | | Debug-level output |
| `--account-id <id>` | | Override Cloudflare account |
| `--config <path>` | | Config file path (default: `./cft.yaml`) |
| `--format <fmt>` | | Output format: `table`, `json`, `csv` |
| `--no-color` | | Disable colored output |
| `--no-interactive` | | Disable prompts (fail instead of asking) |

## Config File

`cft.yaml` — validated on every run with actionable errors.

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
packages/cft/
├── bin/cft.ts          # Entry point
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
