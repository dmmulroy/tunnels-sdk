import { describe, it, assert } from "@effect/vitest"
import { Effect } from "effect"
import {
  TunnelSdkError,
  TunnelApiError,
  TunnelAuthError,
  TunnelNotFoundError,
  TunnelProcessError,
  BinaryInstallError,
  ConfigValidationError,
} from "./errors.js"

describe("Effect errors", () => {
  describe("_tag discriminants", () => {
    it("TunnelSdkError has correct _tag", () => {
      const error = new TunnelSdkError({ message: "boom" })
      assert.strictEqual(error._tag, "TunnelSdkError")
    })

    it("TunnelApiError has correct _tag", () => {
      const error = new TunnelApiError({
        status: 500,
        errors: [{ code: 1000, message: "internal error" }],
      })
      assert.strictEqual(error._tag, "TunnelApiError")
    })

    it("TunnelAuthError has correct _tag", () => {
      const error = new TunnelAuthError({})
      assert.strictEqual(error._tag, "TunnelAuthError")
    })

    it("TunnelNotFoundError has correct _tag", () => {
      const error = new TunnelNotFoundError({ tunnelRef: "my-tunnel" })
      assert.strictEqual(error._tag, "TunnelNotFoundError")
    })

    it("TunnelProcessError has correct _tag", () => {
      const error = new TunnelProcessError({ message: "process died" })
      assert.strictEqual(error._tag, "TunnelProcessError")
    })

    it("BinaryInstallError has correct _tag", () => {
      const error = new BinaryInstallError({ message: "download failed" })
      assert.strictEqual(error._tag, "BinaryInstallError")
    })

    it("ConfigValidationError has correct _tag", () => {
      const error = new ConfigValidationError({
        message: "invalid config",
        issues: [{ path: ["ingress", 0], message: "missing service" }],
      })
      assert.strictEqual(error._tag, "ConfigValidationError")
    })
  })

  describe("TunnelAuthError default message", () => {
    it("uses default message when none provided", () => {
      const error = new TunnelAuthError({})
      assert.strictEqual(
        error.message,
        "Authentication failed. Check your API token and account ID."
      )
    })

    it("uses provided message when given", () => {
      const error = new TunnelAuthError({ message: "custom auth error" })
      assert.strictEqual(error.message, "custom auth error")
    })
  })

  describe("TunnelApiError fields", () => {
    it("stores status and errors array", () => {
      const errors = [
        { code: 1000, message: "not found" },
        { code: 1001, message: "invalid param" },
      ]
      const error = new TunnelApiError({ status: 404, errors })
      assert.strictEqual(error.status, 404)
      assert.deepStrictEqual(error.errors, errors)
    })
  })

  describe("Effect.catchTag integration", () => {
    it.effect("catches TunnelApiError by tag", () =>
      Effect.gen(function* () {
        const result = yield* Effect.fail(
          new TunnelApiError({
            status: 403,
            errors: [{ code: 10000, message: "auth required" }],
          })
        ).pipe(
          Effect.catchTag("TunnelApiError", (e) =>
            Effect.succeed(`caught: ${e.status}`)
          )
        )
        assert.strictEqual(result, "caught: 403")
      })
    )

    it.effect("catches TunnelNotFoundError by tag", () =>
      Effect.gen(function* () {
        const result = yield* Effect.fail(
          new TunnelNotFoundError({ tunnelRef: "my-tunnel" })
        ).pipe(
          Effect.catchTag("TunnelNotFoundError", (e) =>
            Effect.succeed(`not found: ${e.tunnelRef}`)
          )
        )
        assert.strictEqual(result, "not found: my-tunnel")
      })
    )

    it.effect("catches TunnelProcessError by tag", () =>
      Effect.gen(function* () {
        const result = yield* Effect.fail(
          new TunnelProcessError({ message: "exited", exitCode: 1 })
        ).pipe(
          Effect.catchTag("TunnelProcessError", (e) =>
            Effect.succeed(`process error: ${e.exitCode}`)
          )
        )
        assert.strictEqual(result, "process error: 1")
      })
    )
  })
})
