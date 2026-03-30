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

Set up the monorepo structure for the `tunnels` package.

## Deliverables
- `packages/tunnels/package.json` — name: `tunnels`, type: module, exports map
- `packages/tunnels/tsconfig.json` — strict, ESM, target ES2022+ (for `using`)
- Root `pnpm-workspace.yaml`
- Root `package.json` with workspace scripts
- Root `tsconfig.json` (base config)
- `packages/tunnels/src/index.ts` — barrel export (stubbed)
- Build with `tsup` or `unbuild` — dual CJS/ESM output
- Vitest for testing
- `.gitignore` for node_modules, dist, .cache

## Notes
- Keep `cli/` and `lib/` as design docs, implementation goes in `packages/`
- Package exports: `tunnels` (main), `tunnels/bin` (binary management)
- Target Node 18+ (for fetch, AbortController, etc.)
