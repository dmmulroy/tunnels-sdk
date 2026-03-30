{
  "id": "ddfa1ec8",
  "title": "Effect refactor: Remove old implementation + clean up dead code",
  "tags": [
    "effect-refactor",
    "cleanup"
  ],
  "status": "closed",
  "created_at": "2026-03-29T02:51:32.274Z"
}

## Goal

Remove all the old class-based implementation files that have been replaced by the Effect SDK. This should only happen AFTER the wrapper (`src/index.ts`) and all tests pass — confirming nothing depends on the old code anymore.

## Context

After the Effect refactor, these files/directories are dead code:
- `packages/tunnels/src/api/client.ts` — replaced by `effect/services/CloudflareApi.ts`
- `packages/tunnels/src/api/interfaces.ts` — replaced by `CloudflareApi` service interface
- `packages/tunnels/src/api/types.ts` — replaced by `effect/schemas.ts`
- `packages/tunnels/src/api/client.test.ts` — replaced by `effect/services/CloudflareApi.test.ts`
- `packages/tunnels/src/api/interfaces.test.ts`
- `packages/tunnels/src/client.ts` — replaced by wrapper in `index.ts`
- `packages/tunnels/src/client.test.ts`
- `packages/tunnels/src/tunnel.ts` — replaced by `TunnelOperations` service + `TunnelInfo` schema
- `packages/tunnels/src/tunnel.test.ts`
- `packages/tunnels/src/tunnel-operations.ts` — replaced by `effect/services/TunnelOperations.ts`
- `packages/tunnels/src/tunnel-operations.test.ts`
- `packages/tunnels/src/process.ts` — replaced by `effect/services/TunnelProcess.ts`
- `packages/tunnels/src/process.test.ts`
- `packages/tunnels/src/logs.ts` — replaced by `LogEntry` stream in TunnelProcess
- `packages/tunnels/src/logs.test.ts`
- `packages/tunnels/src/expose.ts` — replaced by `effect/expose.ts`
- `packages/tunnels/src/expose.test.ts`
- `packages/tunnels/src/errors.ts` — replaced by `effect/errors.ts`
- `packages/tunnels/src/errors.test.ts`
- `packages/tunnels/src/config/schema.ts` — replaced by `effect/config.ts`
- `packages/tunnels/src/config/schema.test.ts`
- `packages/tunnels/src/defaults.ts` — replaced by service layers
- `packages/tunnels/src/defaults.test.ts`
- `packages/tunnels/src/test-utils.ts`
- `packages/tunnels/src/managers/` — entire directory (replaced by Effect services)

**Keep**: `packages/tunnels/src/bin/` — the `cloudflared.ts` binary resolver is still used by `CloudflaredBinary` service.

## What to do

1. Run `pnpm test` and `pnpm typecheck` to confirm everything passes BEFORE deleting
2. Delete all the files listed above
3. Remove the old `api/` directory
4. Remove the old `managers/` directory
5. Remove the old `config/` directory
6. Check for any remaining imports of old files — `grep -r "from.*\./api\|from.*\./tunnel\|from.*\./process\|from.*\./logs\|from.*\./expose\|from.*\./errors\|from.*\./config\|from.*\./defaults\|from.*\./managers\|from.*\./client" packages/tunnels/src/ --include="*.ts"`
7. Update tsdown config if it references any old entry points
8. Run `pnpm test` and `pnpm typecheck` again to confirm nothing broke

## Acceptance criteria

- [ ] All old implementation files removed
- [ ] `bin/` directory preserved
- [ ] `effect/` directory is the only source of truth
- [ ] `src/index.ts` (wrapper) is the only non-effect, non-bin source file
- [ ] No dangling imports to deleted files
- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` succeeds

## Dependencies

- Requires: TODO-90f519ca (wrapper — confirms old code is no longer imported)
- All tests passing with the new implementation
