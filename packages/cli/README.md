# tunnels-cli

CLI for Cloudflare Tunnels.

## Install

```bash
pnpm install
pnpm build
```

Run from the monorepo:

```bash
node packages/cli/bin/tunnels.js --help
```

## Quick Tunnel

Anonymous quick tunnels do not require Cloudflare credentials.

```bash
tunnels expose 3000
```

For authenticated commands, set both environment variables:

```bash
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_API_TOKEN=...
```

## Commands

The current CLI registers tunnel commands at the top level.

```bash
tunnels create <name> [--dns]
tunnels list [--status <status>]
tunnels info <name-or-id>
tunnels run <name-or-id>
tunnels stop <name-or-id>
tunnels logs <name-or-id>
tunnels token <name-or-id>
tunnels delete <name-or-id> [--force]
```

Ingress, DNS, route, and VNet commands are grouped:

```bash
tunnels ingress add <hostname> <service>
tunnels ingress list
tunnels ingress remove <hostname>

tunnels dns create <hostname> --tunnel <name>
tunnels dns list
tunnels dns remove <hostname>

tunnels route add <cidr> --tunnel <name>
tunnels route list
tunnels route remove <cidr>

tunnels vnet create <name> [--default]
tunnels vnet list
tunnels vnet delete <name>
```

Status lists known tunnels with health columns:

```bash
tunnels status
```

Auth and config command groups are registered but are not connected to a live
backend yet. They currently return a user-facing “not yet connected” error.

```bash
tunnels auth login --token <token>
tunnels auth status
tunnels auth logout

tunnels config validate
tunnels config diff
tunnels config push [--dry-run]
tunnels config pull
tunnels config init
```

## Global Flags

```bash
--json
--quiet, -q
--verbose
--account-id <id>
--config <path>
--format table|json|csv
--no-color
--no-interactive
```

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | User error |
| `2` | Authentication error |
| `3` | Network or API error |
| `4` | Tunnel runtime error |

## Development

```bash
pnpm test
pnpm typecheck
pnpm build
```
