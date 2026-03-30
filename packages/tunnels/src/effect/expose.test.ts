import { describe, it, assert } from "@effect/vitest"
import { Effect, Layer, Scope, Exit } from "effect"
import { CloudflaredBinary } from "./services/CloudflaredBinary.js"
import { expose } from "./expose.js"
import { expose as exposeWrapper } from "../wrapper.js"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const fakeBinaryPath = resolve(__dirname, "../test-fixtures/fake-cloudflared.sh")

/** Layer that provides our fake cloudflared binary */
const FakeBinaryLayer = Layer.succeed(
  CloudflaredBinary,
  CloudflaredBinary.of({
    path: Effect.succeed(fakeBinaryPath),
    ensureInstalled: () => Effect.succeed(fakeBinaryPath),
    install: () => Effect.succeed(void 0),
    isInstalled: () => Effect.succeed(true),
  }),
)

describe("expose (Effect)", () => {
  it.effect("returns URL within a managed scope", () =>
    Effect.gen(function* () {
      const result = yield* expose(3000)
      assert.isTrue(result.url.includes("trycloudflare.com"))
      // Process is alive here — scope finalizer kills it when this block exits
    }).pipe(
      Effect.scoped,
      Effect.provide(FakeBinaryLayer),
    ),
  )
})

describe("expose() wrapper lifecycle", () => {
  it("returns URL and process stays alive until close()", async () => {
    const tunnel = await exposeWrapper(3000, { _binaryLayer: FakeBinaryLayer })

    // URL should be present — old bug: process was killed before this returned
    assert.isTrue(tunnel.url.includes("trycloudflare.com"))

    // close() should not throw and should kill the process
    await tunnel.close()
  }, 10_000)

  it("supports Symbol.asyncDispose", async () => {
    const tunnel = await exposeWrapper(3000, { _binaryLayer: FakeBinaryLayer })
    assert.isTrue(tunnel.url.includes("trycloudflare.com"))
    assert.strictEqual(typeof tunnel[Symbol.asyncDispose], "function")
    await tunnel[Symbol.asyncDispose]()
  }, 10_000)

  it("double close() is safe (idempotent)", async () => {
    const tunnel = await exposeWrapper(3000, { _binaryLayer: FakeBinaryLayer })
    await tunnel.close()
    // Second close should not throw
    await tunnel.close()
  }, 10_000)
})
