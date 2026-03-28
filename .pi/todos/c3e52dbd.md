{
  "id": "c3e52dbd",
  "title": "Monorepo scaffold: pnpm workspace, tsconfig, build tooling",
  "tags": [
    "sdk",
    "infra"
  ],
  "status": "closed",
  "created_at": "2026-03-28T23:15:11.389Z"
}

Set up the monorepo structure for the `tunnel-sdk` package.

## Deliverables
- `packages/tunnel-sdk/package.json` — name: `tunnel-sdk`, type: module, exports map
- `packages/tunnel-sdk/tsconfig.json` — strict, ESM, target ES2022+ (for `using`)
- Root `pnpm-workspace.yaml`
- Root `package.json` with workspace scripts
- Root `tsconfig.json` (base config)
- `packages/tunnel-sdk/src/index.ts` — barrel export (stubbed)
- Build with `tsup` or `unbuild` — dual CJS/ESM output
- Vitest for testing
- `.gitignore` for node_modules, dist, .cache

## Notes
- Keep `cli/` and `lib/` as design docs, implementation goes in `packages/`
- Package exports: `tunnel-sdk` (main), `tunnel-sdk/bin` (binary management)
- Target Node 18+ (for fetch, AbortController, etc.)
