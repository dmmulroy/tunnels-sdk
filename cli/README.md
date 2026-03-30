# `tunnels` — A Modern CLI for Cloudflare Tunnels

Design principles stolen from the best: `gh` (noun-verb), `fly` (deploy-first), `railway` (interactive-first), `wrangler` (config-as-code).

## Problems with `cloudflared`

| Problem | Example |
|---------|---------|
| Deep nested subcommands | `cloudflared tunnel route ip add 172.16.0.0/16 my-tunnel` |
| Positional args with no guardrails | Is the CIDR first or the tunnel name? |
| YAML config is fragile | Ingress ordering matters, catch-all required but easy to forget |
| No structured output | Output is log-style text, not parseable |
| Auth is browser-only | `cloudflared tunnel login` pops a browser — unusable in CI |
| No quick one-liner | Exposing a port with a named tunnel takes 4+ steps |
| No `--dry-run` | Config mistakes discovered at deploy time |
| `--config` silently ignored | [GH #1029](https://github.com/cloudflare/cloudflared/issues/1029) |
| Service install ignores env vars | [GH #1517](https://github.com/cloudflare/cloudflared/issues/1517) |

---

## Command Reference

### `tunnels expose` — The One-Liner

The ngrok killer. Zero config, instant tunnel.

```bash
# Anonymous quick tunnel
tunnels expose 3000
# ⚡ Tunnel live → https://abc123.trycloudflare.com → localhost:3000

# With a custom domain (requires auth)
tunnels expose 3000 --hostname app.example.com
# ⚡ Tunnel live → https://app.example.com → localhost:3000

# Multiple services in one shot
tunnels expose 3000 8080:admin.example.com 9090:api.example.com

# Expose a non-HTTP service
tunnels expose 22 --protocol ssh --hostname ssh.example.com

# Expose with access control
tunnels expose 3000 --hostname app.example.com --access-policy email:*@company.com
```

**Behavior:**
- No auth? Creates an anonymous quick tunnel (random `*.trycloudflare.com` subdomain).
- Auth present + `--hostname`? Creates a named tunnel, configures ingress, creates DNS CNAME, runs it. All in one command.
- Ctrl+C cleans up: stops tunnel, optionally deletes DNS record (prompts or `--cleanup`).

---

### `tunnels tunnel` — Named Tunnel Management

```bash
# Interactive creation — prompts for everything you don't specify
tunnels tunnel create
# ? Tunnel name: my-app
# ? Service URL: http://localhost:3000
# ? Hostname: app.example.com
# ? Create DNS record? Yes
# ✓ Tunnel "my-app" created (id: c1744f8b...)
# ✓ DNS CNAME app.example.com → c1744f8b.cfargotunnel.com
# Run with: tunnels tunnel run my-app

# Fully non-interactive
tunnels tunnel create my-app \
  --service http://localhost:3000 \
  --hostname app.example.com \
  --dns

# List tunnels
tunnels tunnel list
# NAME      STATUS    CONNECTIONS  CREATED
# my-app    healthy   4            2025-02-18 22:41:43
# staging   inactive  0            2025-01-10 14:22:01

tunnels tunnel list --json
# [{"id":"c1744f8b...","name":"my-app","status":"healthy",...}]

# Inspect a tunnel
tunnels tunnel info my-app
tunnels tunnel info my-app --json

# Run a tunnel
tunnels tunnel run my-app
tunnels tunnel run my-app --config ./tunnels.yaml

# Stop a tunnel
tunnels tunnel stop my-app

# Delete a tunnel
tunnels tunnel delete my-app
tunnels tunnel delete my-app --force  # even if connections are active

# Stream logs
tunnels tunnel logs my-app
tunnels tunnel logs my-app --json     # structured log lines
tunnels tunnel logs my-app --level error --since 5m

# Get the tunnel token (for running on other machines)
tunnels tunnel token my-app
```

---

### `tunnels ingress` — Ingress Rule Management

```bash
# Add a route
tunnels ingress add app.example.com http://localhost:3000
tunnels ingress add api.example.com http://localhost:8080 --tunnel my-app

# Add with origin settings
tunnels ingress add app.example.com http://localhost:3000 \
  --connect-timeout 60s \
  --no-tls-verify

# List rules
tunnels ingress list --tunnel my-app
# HOSTNAME           SERVICE                  ORIGIN SETTINGS
# app.example.com    http://localhost:3000     connectTimeout=30s
# api.example.com    http://localhost:8080     (defaults)
# *                  http_status:404           (catch-all)

# Remove a route
tunnels ingress remove api.example.com --tunnel my-app

# The catch-all is auto-managed — if you don't have one, tunnels adds
# http_status:404 and warns you. No more silent 502s.
```

---

### `tunnels route` — Private Network Routes

```bash
# Add a route
tunnels route add 172.16.0.0/16 --tunnel my-app
tunnels route add 10.0.0.0/8 --tunnel my-app --vnet production

# List routes
tunnels route list
tunnels route list --tunnel my-app

# Check which route handles an IP
tunnels route check 172.16.5.42
# ✓ 172.16.5.42 → tunnel "my-app" via route 172.16.0.0/16

# Remove a route
tunnels route remove 172.16.0.0/16
```

---

### `tunnels vnet` — Virtual Network Management

```bash
tunnels vnet create production
tunnels vnet create staging --default
tunnels vnet list
tunnels vnet delete staging
```

---

### `tunnels dns` — DNS Record Management

```bash
# Auto-create CNAME for a tunnel
tunnels dns create app.example.com --tunnel my-app
# ✓ CNAME app.example.com → c1744f8b.cfargotunnel.com

# List DNS records pointing to tunnels
tunnels dns list

# Remove
tunnels dns remove app.example.com
```

---

### `tunnels config` — Config File Management

```bash
# Validate config
tunnels config validate
# ✓ Config valid. 2 ingress rules, catch-all will be auto-added.

tunnels config validate --strict
# ✗ Missing explicit catch-all rule. Add { service: "http_status:404" }

# Diff what would change vs remote
tunnels config diff
# ~ ingress[0].hostname: app.example.com (unchanged)
# + ingress[1].hostname: api.example.com (new)
# - ingress[2].hostname: old.example.com (removed)

# Push config to Cloudflare (remote-managed tunnels)
tunnels config push
tunnels config push --dry-run

# Pull current remote config to local file
tunnels config pull
tunnels config pull --output tunnels.yaml

# Initialize a new config file interactively
tunnels config init
```

---

### `tunnels auth` — Authentication

```bash
# Browser flow (existing behavior)
tunnels auth login

# Headless / CI — token-based
tunnels auth login --token $CF_API_TOKEN

# Service token for automated systems
tunnels auth login --service-token --client-id $ID --client-secret $SECRET

# Check auth status
tunnels auth status
# ✓ Authenticated as dillon@example.com
# Account: My Account (699d98642c564d2e855e9661899b7252)
# Token expires: 2025-12-31

# Logout
tunnels auth logout
```

---

### `tunnels dev` — Development Mode

```bash
# Watch mode — restarts tunnel when config changes
tunnels dev --port 3000
# ⚡ Tunnel live → https://abc123.trycloudflare.com → localhost:3000
# 👀 Watching tunnels.yaml for changes...

# Wrap your dev server — tunnels detects the port
tunnels dev -- npm run dev
# Starting npm run dev...
# Detected port 5173
# ⚡ Tunnel live → https://abc123.trycloudflare.com → localhost:5173

# With a named tunnel for stable URLs
tunnels dev --tunnel my-app --port 3000

# Auto-reload on config change
tunnels dev --watch
```

---

### `tunnels status` — Quick Health Check

```bash
tunnels status
# TUNNEL    STATUS    CONNS  UPTIME     COLO
# my-app    healthy   4/4    2d 14h     bos01, phl01
# staging   degraded  2/4    45m        iad01

tunnels status my-app --json
```

---

## Global Flags

Available on every command:

```
--json              Structured JSON output
--quiet             Suppress non-essential output
--verbose           Show debug-level output
--account-id ID     Override Cloudflare account
--config PATH       Path to config file (default: ./tunnels.yaml)
--format FORMAT     Output format: table (default), json, csv
--no-color          Disable colored output
--no-interactive    Disable all prompts (fail instead of asking)
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | User error (bad args, invalid config) |
| 2 | Authentication error |
| 3 | Network / API error |
| 4 | Tunnel runtime error |
| 130 | Interrupted (Ctrl+C) — clean shutdown performed |

---

## Config File: `tunnels.yaml`

```yaml
# tunnels.yaml — validated on every run, errors are actionable
tunnel: my-app

ingress:
  - hostname: app.example.com
    service: http://localhost:3000
    origin:
      connectTimeout: 30s
      noTLSVerify: false
      httpHostHeader: ""
      originServerName: ""

  - hostname: api.example.com
    service: http://localhost:8080
    origin:
      connectTimeout: 60s

  # catch-all is auto-generated if missing (warns in non-strict mode)
  # In strict mode, you must include it explicitly:
  # - service: http_status:404

dns:
  auto: true            # auto-create/update CNAME records on `tunnels tunnel run`
  cleanup: true         # remove DNS records on `tunnels tunnel delete`

routes:
  - network: 172.16.0.0/16
  - network: 10.0.0.0/8
    vnet: production

access:
  policy: email
  allowed:
    - "*@company.com"
```

### Config Validation Rules

1. **Ingress must have at least one rule** — error if empty.
2. **Catch-all auto-added** — if the last rule has a hostname, `http_status:404` is appended and a warning is emitted. In `--strict` mode, this is an error.
3. **Hostnames must be valid** — checked against the domain's zone.
4. **Service URLs must be valid** — scheme + host + port validated.
5. **Duplicate hostnames are an error** — not silently last-wins.
6. **Unknown keys are an error** — no silent typos like `connetTimeout`.

---

## Shell Completions

```bash
tunnels completion bash >> ~/.bashrc
tunnels completion zsh >> ~/.zshrc
tunnels completion fish >> ~/.config/fish/completions/tunnels.fish
tunnels completion powershell >> $PROFILE
```

Completions are context-aware:
- `tunnels tunnel run <TAB>` → lists tunnel names
- `tunnels route add <CIDR> --tunnel <TAB>` → lists tunnel names
- `tunnels ingress add <TAB>` → suggests hostnames from your zones

---

## Comparison to `cloudflared`

| Capability | `cloudflared` | `tunnels` |
|------------|--------------|-------|
| One-liner expose | `cloudflared tunnel --url localhost:3000` (anonymous only) | `tunnels expose 3000 --hostname app.example.com` |
| Create + configure + DNS + run | 4+ separate commands | `tunnels expose` or `tunnels tunnel create --dns` |
| Structured output | ❌ Log-style text | `--json` on everything |
| Config validation | ❌ Fails at runtime | `tunnels config validate` with line numbers |
| Config diff | ❌ | `tunnels config diff` |
| Interactive mode | ❌ | Prompts with flag fallbacks |
| Dev mode with watch | ❌ | `tunnels dev --watch` |
| CI/headless auth | ❌ Browser only | `--token`, `--service-token` |
| Shell completions | ❌ | Built-in, context-aware |
| Exit codes | Generic | Meaningful per error class |
| Agent-friendly | ❌ | JSON output + schema introspection |
