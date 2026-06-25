import { describe, it, assert } from "@effect/vitest"
import { Effect } from "effect"
import { AuthTokenSet, makeApiTokenAuth } from "./CloudflareAuth.js"

describe("CloudflareAuth", () => {
  describe("makeApiTokenAuth", () => {
    it.effect("uses the configured API token as the access token", () =>
      Effect.gen(function* () {
        const auth = makeApiTokenAuth("test-api-token")

        const accessToken = yield* auth.getAccessToken({ minTTLMillis: 60_000 })
        const refreshed = yield* auth.refresh()
        yield* auth.revoke()

        assert.strictEqual(accessToken, "test-api-token")
        assert.instanceOf(refreshed, AuthTokenSet)
        assert.strictEqual(refreshed.accessToken, "test-api-token")
      }),
    )
  })
})
