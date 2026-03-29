import { describe, it, assert } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { BinaryInstallError } from "../errors.js"
import { CloudflaredBinary } from "./CloudflaredBinary.js"

// ---------------------------------------------------------------------------
// Stub layer (no real I/O)
// ---------------------------------------------------------------------------

function stubLayer(opts: {
  installed?: boolean
  path?: string
  installFails?: boolean
} = {}) {
  const { installed = true, path = "/fake/path/cloudflared", installFails = false } = opts
  return Layer.succeed(
    CloudflaredBinary,
    CloudflaredBinary.of({
      path: Effect.succeed(path),
      ensureInstalled: () =>
        installed
          ? Effect.succeed(path)
          : installFails
            ? Effect.fail(new BinaryInstallError({ message: "Install failed" }))
            : Effect.succeed(path),
      install: () =>
        installFails
          ? Effect.fail(new BinaryInstallError({ message: "Install failed" }))
          : Effect.succeed(void 0),
      isInstalled: () => Effect.succeed(installed),
    }),
  )
}

describe("CloudflaredBinary (Effect)", () => {
  it.effect("path returns binary path", () =>
    Effect.gen(function* () {
      const binary = yield* CloudflaredBinary
      const p = yield* binary.path
      assert.strictEqual(p, "/fake/path/cloudflared")
    }).pipe(Effect.provide(stubLayer())),
  )

  it.effect("isInstalled returns true when installed", () =>
    Effect.gen(function* () {
      const binary = yield* CloudflaredBinary
      const installed = yield* binary.isInstalled()
      assert.isTrue(installed)
    }).pipe(Effect.provide(stubLayer({ installed: true }))),
  )

  it.effect("isInstalled returns false when not installed", () =>
    Effect.gen(function* () {
      const binary = yield* CloudflaredBinary
      const installed = yield* binary.isInstalled()
      assert.isFalse(installed)
    }).pipe(Effect.provide(stubLayer({ installed: false }))),
  )

  it.effect("ensureInstalled returns path when already installed", () =>
    Effect.gen(function* () {
      const binary = yield* CloudflaredBinary
      const p = yield* binary.ensureInstalled()
      assert.strictEqual(p, "/fake/path/cloudflared")
    }).pipe(Effect.provide(stubLayer({ installed: true }))),
  )

  it.effect("install wraps errors in BinaryInstallError", () =>
    Effect.gen(function* () {
      const binary = yield* CloudflaredBinary
      const msg = yield* binary.install().pipe(
        Effect.catchTag("BinaryInstallError", (e) => Effect.succeed(e.message)),
      )
      assert.strictEqual(msg, "Install failed")
    }).pipe(Effect.provide(stubLayer({ installFails: true }))),
  )
})
