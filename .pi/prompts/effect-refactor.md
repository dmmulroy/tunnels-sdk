# Effect Refactor — Pick Up and Continue

You are working on refactoring the `tunnel-sdk` package from class-based async/await TypeScript to idiomatic Effect TS. The full design lives in `EFFECT_REFACTOR_PLAN.md` at the repo root. The work is tracked as file-backed todos tagged `effect-refactor`.

## Your job

1. **List todos** tagged `effect-refactor` to see the current state.
2. **If any todo is assigned (in-progress)**: read it, check what work exists on disk for it, figure out what's left, and finish it. Claim it if not already claimed.
3. **If nothing is in-progress**: find the next todo whose dependencies are all closed. Read its body for full context. Claim it, then do it.
4. **Work in TDD vertical slices**: write one test for one behavior, make it pass, repeat. Do NOT write all tests then all implementation.
5. **When done**: verify `pnpm typecheck` and `pnpm test` pass in `packages/tunnel-sdk`, then close the todo.

## Dependency chain (execute top-to-bottom, respecting arrows)

```
TODO-49756c12  Setup: deps + package.json exports
      │
TODO-9c25b94b  Errors + Schemas
      │
      ├──────────────────┬──────────────────┐
TODO-5f361da8        TODO-3f1ffd3f      TODO-79086372
Config validation    CloudflareApi svc   CloudflaredBinary svc
                          │                    │
                    TODO-6ec09735         TODO-e590bb26
                    4 resource managers   TunnelProcess + expose
                          │
                    TODO-ee4031e7
                    TunnelOperations svc
                          │
                    TODO-b0c6986e
                    Layers + effect/index.ts
                          │
                    TODO-90f519ca
                    Async/await wrapper
                          │
              ┌───────────┼───────────┐
        TODO-ddfa1ec8  TODO-01a75219  TODO-e2e90f39
        Remove old code   Wire cft CLI   Update examples
```

A todo is **ready** when every todo it depends on (listed in its "Dependencies" section) is closed.

## Key references

- **Design doc**: `EFFECT_REFACTOR_PLAN.md` — read relevant sections for the todo you're working on
- **Effect docs**: `.dependencies/effect-smol/LLMS.md` — read this BEFORE writing any Effect code. It covers `Effect.fn`, `ServiceMap.Service`, `Schema.TaggedErrorClass`, Layer composition, and all the patterns used in this refactor.
- **Effect examples**: `.dependencies/effect-smol/ai-docs/src/` — working code examples for services, streams, child processes, testing, etc.
- **Current SDK source**: `packages/tunnel-sdk/src/` — the existing implementation you're porting from
- **Current SDK tests**: `packages/tunnel-sdk/src/**/*.test.ts` — behaviors to preserve

## Rules

- Each todo body contains everything you need: what to create, what to port, what to test, which files to read, Effect patterns to use, and acceptance criteria.
- Use `@effect/vitest` for all new tests (`it.effect`, `layer()` helper).
- Use `Effect.fn("ServiceName.methodName")` for all service methods (automatic spans).
- Mock at service boundaries in tests, never mock internals.
- Run `pnpm typecheck` and `pnpm test` in `packages/tunnel-sdk` before closing a todo.
- If a todo is partially done, pick up where it left off — don't redo completed work.
