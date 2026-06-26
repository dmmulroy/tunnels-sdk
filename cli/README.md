# `tunnels` CLI

Current command reference for the Cloudflare Tunnels CLI in this repo.

## Quick Tunnel

Anonymous quick tunnels do not require Cloudflare credentials.

```bash
tunnels expose 3000
```

Authenticated commands read credentials from the environment:

```bash
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_API_TOKEN=...
```

## Top-Level Tunnel Commands

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

## Resource Commands

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

## Status

```bash
tunnels status
```

## Registered But Not Yet Wired

Auth and config command groups are registered, but the live layer currently
returns a user-facing “not yet connected” error for them.

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
