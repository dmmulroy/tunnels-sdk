# Integration & E2E Test Plan

The current test suite (198 tests) mocks all external boundaries — HTTP calls, child processes, and the filesystem. This means the code paths that actually talk to Cloudflare's API or spawn `cloudflared` have **zero test coverage**. This plan fills that gap.

---

## Test Tiers

### Tier 1: Process Integration (no network, no auth)
**Goal:** Verify the SDK correctly spawns `cloudflared`, parses its real stderr output, and manages its lifecycle. These tests require the `cloudflared` binary but no Cloudflare account.

| Test | What it proves |
|------|---------------|
| **Binary auto-install** | `CloudflaredBinary.ensureInstalled()` downloads the pinned version, caches it, and returns a valid path |
| **Binary idempotent install** | Second call to `ensureInstalled()` is a no-op (fast path) |
| **Binary version check** | `cloudflared --version` runs and returns expected version string |
| **Quick tunnel spawn** | `expose(port)` spawns process, URL appears in stderr, process stays alive |
| **Quick tunnel cleanup** | `close()` sends SIGTERM, process exits cleanly |
| **Quick tunnel actual connectivity** | Start an HTTP server on `port`, expose it, `fetch(tunnel.url)` returns expected response |
| **Stderr JSON parsing (real output)** | Spawn `cloudflared tunnel --url ...`, capture real stderr, verify `parseLine` and `toEvent` handle actual output format |
| **Process crash handling** | Spawn with invalid args, verify `TunnelProcessError` with useful message |
| **SIGTERM grace period** | Process handles SIGTERM gracefully (doesn't leave orphan connections) |

**Setup:** Just `pnpm test:integration:process` — no env vars needed. Tests auto-download the binary.

**Estimated time:** ~30s (dominated by binary download on first run, cached after).

---

### Tier 2: API Integration (network, requires auth)
**Goal:** Verify the SDK correctly calls the Cloudflare API, maps responses, handles errors, and does real CRUD.

**Requires:** `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` env vars (a test account with a zone).

| Test | What it proves |
|------|---------------|
| **Auth validation** | Providing an invalid token → `TunnelAuthError` with meaningful message |
| **Tunnel CRUD lifecycle** | `create("test-tunnel")` → `get("test-tunnel")` → `list()` includes it → `delete("test-tunnel")` → `list()` doesn't include it |
| **Create with options** | `create("test", { ingress, dns: { auto: true } })` creates tunnel + configures ingress + creates CNAME |
| **Ingress management** | `set` → `list` shows rules → `add` → `list` shows new rule → `remove` → `list` updated |
| **Ingress catch-all auto-append** | Setting rules without catch-all auto-appends `http_status:404` |
| **DNS ensure idempotent** | `ensure()` twice with same params is safe |
| **DNS create + remove** | `ensure()` → verify CNAME in zone → `remove()` → verify gone |
| **Route add + list + remove** | Full route lifecycle |
| **VNet CRUD** | `create()` → `list()` includes it → `delete()` |
| **Pagination** | Create 60+ test tunnels (or use pre-existing), call `listAll()`, verify all returned across multiple pages |
| **Error mapping** | Delete nonexistent tunnel → `TunnelNotFoundError`. Use wrong account ID → `TunnelApiError` with status code |
| **Rate limiting / retry** | Verify transient 429s are retried (hard to trigger deterministically — may need a mock proxy) |

**Cleanup:** Each test cleans up after itself. Use a naming prefix (e.g., `cft-test-*`) and a global teardown that deletes anything matching the prefix.

**Setup:** 
```bash
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_API_TOKEN=...
export CFT_TEST_ZONE=example.com  # zone the token has access to
pnpm test:integration:api
```

**Estimated time:** ~60-90s (API calls are slow).

---

### Tier 3: Full E2E (network + process + real traffic)
**Goal:** Verify the complete tunnel lifecycle works end-to-end with real traffic flowing through Cloudflare's network.

| Test | What it proves |
|------|---------------|
| **Quick tunnel roundtrip** | Start HTTP server → `expose(port)` → `fetch(tunnel.url)` returns expected body → `close()` |
| **Named tunnel full lifecycle** | `create("e2e-test", { ingress: [...], dns: { auto: true } })` → run tunnel → `fetch("https://e2e-test.example.com")` returns expected body → stop → delete with DNS cleanup |
| **Multi-service ingress** | Create tunnel with 2 hostnames routing to 2 local servers → verify both respond correctly |
| **TunnelClient wrapper roundtrip** | Use the `TunnelClient` class (not Effect API) to do full CRUD + verify it works |
| **Config validation → deploy** | `parseConfigFromFile("cft.yaml")` → create tunnel from validated config → verify it runs |
| **Tunnel process events** | Run tunnel, verify `Connected` events fire, connectors populate, status becomes `healthy` |
| **Tunnel reconnection** | Run tunnel, kill one connector, verify `Disconnected` + `Reconnecting` events fire, status transitions |
| **Graceful shutdown** | Run tunnel, close scope, verify `exitCode` resolves with 0 |

**Setup:**
```bash
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_API_TOKEN=...
export CFT_TEST_ZONE=example.com
pnpm test:e2e
```

**Estimated time:** ~3-5 min.

---

### Tier 4: CLI E2E
**Goal:** Verify the `cft` CLI binary works as a user would invoke it.

| Test | What it proves |
|------|---------------|
| **`cft --version`** | Prints version, exits 0 |
| **`cft --help`** | Lists all subcommands |
| **`cft expose 3000`** | Prints URL, stays alive, Ctrl+C exits 0 |
| **`cft expose 3000 --hostname app.example.com`** | Creates named tunnel, prints URL |
| **`cft tunnel list --json`** | Valid JSON array output |
| **`cft tunnel create test-cli`** | Creates tunnel, prints confirmation |
| **`cft tunnel delete test-cli --force`** | Deletes, prints confirmation |
| **`cft config validate`** | Validates cft.yaml, prints result |
| **Exit codes** | Invalid token → exit 2. Bad input → exit 1. Network error → exit 3 |
| **`--no-interactive` mode** | No prompts, fails fast with missing required args |

**Implementation:** Shell script or Node test harness that spawns `cft` as a child process, captures stdout/stderr/exit code.

---

## Infrastructure

### Test File Layout
```
packages/tunnel-sdk/
  src/
    test-fixtures/
      fake-cloudflared.sh          # ← already exists
      sample-stderr-output.jsonl   # real cloudflared stderr samples
  test/
    integration/
      binary.test.ts               # Tier 1: binary management
      quick-tunnel.test.ts         # Tier 1: process lifecycle
      api-crud.test.ts             # Tier 2: API operations
      dns.test.ts                  # Tier 2: DNS management
      ingress.test.ts              # Tier 2: ingress rules
      routes.test.ts               # Tier 2: route management
      vnets.test.ts                # Tier 2: virtual networks
      pagination.test.ts           # Tier 2: paginate verification
    e2e/
      quick-tunnel.test.ts         # Tier 3: full roundtrip
      named-tunnel.test.ts         # Tier 3: full lifecycle
      multi-service.test.ts        # Tier 3: multi-ingress
      tunnel-events.test.ts        # Tier 3: process events
      wrapper-client.test.ts       # Tier 3: TunnelClient class

packages/cft/
  test/
    e2e/
      cli-basic.test.ts            # Tier 4: version, help
      cli-expose.test.ts           # Tier 4: expose command
      cli-tunnel.test.ts           # Tier 4: tunnel CRUD
      cli-output.test.ts           # Tier 4: --json, exit codes
```

### Vitest Configuration

```ts
// vitest.config.integration.ts
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run serially — these share real resources
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
})

// vitest.config.e2e.ts
export default defineConfig({
  test: {
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
})
```

### Package.json Scripts
```json
{
  "scripts": {
    "test": "vitest run",
    "test:integration": "vitest run -c vitest.config.integration.ts",
    "test:e2e": "vitest run -c vitest.config.e2e.ts",
    "test:all": "pnpm test && pnpm test:integration && pnpm test:e2e"
  }
}
```

### CI Strategy

```yaml
# Unit tests — every PR, no secrets needed
unit:
  runs-on: ubuntu-latest
  steps:
    - pnpm test

# Integration — every PR, needs CF test account secrets
integration:
  runs-on: ubuntu-latest
  needs: unit
  env:
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_TEST_ACCOUNT_ID }}
    CLOUDFLARE_API_TOKEN: ${{ secrets.CF_TEST_API_TOKEN }}
    CFT_TEST_ZONE: ${{ secrets.CF_TEST_ZONE }}
  steps:
    - pnpm test:integration

# E2E — merge to main only (slow, uses real infra)
e2e:
  runs-on: ubuntu-latest
  needs: integration
  if: github.ref == 'refs/heads/main'
  env:
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_TEST_ACCOUNT_ID }}
    CLOUDFLARE_API_TOKEN: ${{ secrets.CF_TEST_API_TOKEN }}
    CFT_TEST_ZONE: ${{ secrets.CF_TEST_ZONE }}
  steps:
    - pnpm test:e2e
```

### Test Account Requirements
- A Cloudflare account (free tier works)
- At least one zone (e.g., `cft-test.dev`)
- API token with permissions:
  - `Zone:DNS:Edit` (for the test zone)
  - `Account:Cloudflare Tunnel:Edit`
  - `Account:Access: Apps and Policies:Edit` (for route tests)

### Cleanup & Isolation
- All test resources use prefix: `cft-integ-{testId}-`
- Each test generates a unique ID (e.g., `cft-integ-a1b2c3-my-tunnel`)
- `afterAll` in each file cleans up resources matching the prefix
- Global teardown script: `scripts/cleanup-test-resources.ts` — deletes all `cft-integ-*` tunnels, DNS records, routes, vnets
- Tests run serially to avoid race conditions on shared account resources

---

## Priority Order

1. **Tier 1 (process)** — implement first, no auth needed, catches real binary/process bugs
2. **Tier 2 (API)** — implement second, validates the core API integration
3. **Tier 3 (E2E)** — implement third, proves the full product works
4. **Tier 4 (CLI E2E)** — implement last, highest-level smoke tests

Tier 1 is the highest-ROI starting point — it would have caught the `expose()` scoping bug, and it requires zero infrastructure setup.
