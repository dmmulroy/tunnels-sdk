{
  "id": "ddfa1ec8",
  "title": "Effect refactor: Remove old implementation + clean up dead code",
  "tags": [
    "effect-refactor",
    "cleanup"
  ],
  "status": "open",
  "created_at": "2026-03-29T02:51:32.274Z",
  "assigned_to_session": "ecb00d1b-8b64-4599-8217-41495ab1058a"
}

## Goal

Remove all the old class-based implementation files that have been replaced by the Effect SDK. This should only happen AFTER the wrapper (`src/index.ts`) and all tests pass — confirming nothing depends on the old code anymore.

## Context

After the Effect refactor, these files/directories are dead code:
- `packages/tunnel-sdk/src/api/client.ts` — replaced by `effect/services/CloudflareApi.ts`
- `packages/tunnel-sdk/src/api/interfaces.ts` — replaced by `CloudflareApi` service interface
- `packages/tunnel-sdk/src/api/types.ts` — replaced by `effect/schemas.ts`
- `packages/tunnel-sdk/src/api/client.test.ts` — replaced by `effect/services/CloudflareApi.test.ts`
- `packages/tunnel-sdk/src/api/interfaces.test.ts`
- `packages/tunnel-sdk/src/client.ts` — replaced by wrapper in `index.ts`
- `packages/tunnel-sdk/src/client.test.ts`
- `packages/tunnel-sdk/src/tunnel.ts` — replaced by `TunnelOperations` service + `TunnelInfo` schema
- `packages/tunnel-sdk/src/tunnel.test.ts`
- `packages/tunnel-sdk/src/tunnel-operations.ts` — replaced by `effect/services/TunnelOperations.ts`
- `packages/tunnel-sdk/src/tunnel-operations.test.ts`
- `packages/tunnel-sdk/src/process.ts` — replaced by `effect/services/TunnelProcess.ts`
- `packages/tunnel-sdk/src/process.test.ts`
- `packages/tunnel-sdk/src/logs.ts` — replaced by `LogEntry` stream in TunnelProcess
- `packages/tunnel-sdk/src/logs.test.ts`
- `packages/tunnel-sdk/src/expose.ts` — replaced by `effect/expose.ts`
- `packages/tunnel-sdk/src/expose.test.ts`
- `packages/tunnel-sdk/src/errors.ts` — replaced by `effect/errors.ts`
- `packages/tunnel-sdk/src/errors.test.ts`
- `packages/tunnel-sdk/src/config/schema.ts` — replaced by `effect/config.ts`
- `packages/tunnel-sdk/src/config/schema.test.ts`
- `packages/tunnel-sdk/src/defaults.ts` — replaced by service layers
- `packages/tunnel-sdk/src/defaults.test.ts`
- `packages/tunnel-sdk/src/test-utils.ts`
- `packages/tunnel-sdk/src/managers/` — entire directory (replaced by Effect services)

**Keep**: `packages/tunnel-sdk/src/bin/` — the `cloudflared.ts` binary resolver is still used by `CloudflaredBinary` service.

## What to do

1. Run `pnpm test` and `pnpm typecheck` to confirm everything passes BEFORE deleting
2. Delete all the files listed above
3. Remove the old `api/` directory
4. Remove the old `managers/` directory
5. Remove the old `config/` directory
6. Check for any remaining imports of old files — `grep -r "from.*\./api\|from.*\./tunnel\|from.*\./process\|from.*\./logs\|from.*\./expose\|from.*\./errors\|from.*\./config\|from.*\./defaults\|from.*\./managers\|from.*\./client" packages/tunnel-sdk/src/ --include="*.ts"`
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
