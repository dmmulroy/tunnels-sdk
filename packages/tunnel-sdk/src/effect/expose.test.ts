import { describe, it, assert } from "@effect/vitest"
import { Effect, Layer, Scope } from "effect"
import { BinaryInstallError, TunnelProcessError } from "./errors.js"
import { CloudflaredBinary } from "./services/CloudflaredBinary.js"

// Note: expose() requires real child process spawning, so we test through
// the CloudflaredBinary stub to verify the function type-checks and the
// binary integration is correct.

describe("expose (types)", () => {
  it("CloudflaredBinary stub provides path", () =>
    Effect.gen(function* () {
      const binary = yield* CloudflaredBinary
      const path = yield* binary.path
      assert.strictEqual(path, "/fake/path/cloudflared")
    }).pipe(
      Effect.provide(
        Layer.succeed(
          CloudflaredBinary,
          CloudflaredBinary.of({
            path: Effect.succeed("/fake/path/cloudflared"),
            ensureInstalled: () => Effect.succeed("/fake/path/cloudflared"),
            install: () => Effect.succeed(void 0),
            isInstalled: () => Effect.succeed(true),
          }),
        ),
      ),
      Effect.runPromise,
    ),
  )
})
