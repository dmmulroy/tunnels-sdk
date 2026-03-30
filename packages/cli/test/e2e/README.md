# CLI E2E Tests

End-to-end tests that spawn the real `tunnels` binary as a child process, hit real Cloudflare APIs, and verify stdout/stderr/exit codes.

## Running

```bash
# Requires real credentials
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_API_TOKEN=...
export CFT_TEST_ZONE=example.com

pnpm test:e2e
```

## Tiers

| Tier | What | Auth required | Binary required |
|------|------|---------------|-----------------|
| 1 | CLI chrome (help, version, flags, errors) | No | No |
| 2 | Quick tunnel (expose, process lifecycle) | No | Yes (cloudflared) |
| 3 | Tunnel CRUD against real API | Yes | No |
| 4 | Full lifecycle (create → configure → DNS → run → teardown) | Yes | Yes |
