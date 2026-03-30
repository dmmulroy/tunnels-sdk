import { assert, describe, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/unstable/cli"
import { auth } from "./auth.js"
import { AuthService } from "../services.js"
import { CliError } from "../errors.js"
import { TestLayer } from "../test-layer.js"

const makeTestAuthService = Effect.gen(function* () {
  const loggedIn = yield* Ref.make(false)
  const storedToken = yield* Ref.make<string | null>(null)
  return {
    service: AuthService.of({
      loginWithToken: (token) =>
        Effect.gen(function* () {
          yield* Ref.set(loggedIn, true)
          yield* Ref.set(storedToken, token)
        }),
      status: () =>
        Effect.gen(function* () {
          const isLoggedIn = yield* Ref.get(loggedIn)
          return isLoggedIn
            ? { authenticated: true as const, email: "user@example.com" }
            : { authenticated: false as const }
        }),
      logout: () => Ref.set(loggedIn, false),
    }),
    isLoggedIn: Ref.get(loggedIn),
    getToken: Ref.get(storedToken),
  }
})

const run = Command.runWith(auth, { version: "0.1.0" })

describe("tunnels auth", () => {
  it.effect("login with --token stores credentials", () =>
    Effect.gen(function* () {
      const { service, isLoggedIn, getToken } = yield* makeTestAuthService
      yield* run(["login", "--token", "my-secret-token"]).pipe(
        Effect.provideService(AuthService, service)
      )
      assert.isTrue(yield* isLoggedIn)
      assert.strictEqual(yield* getToken, "my-secret-token")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("status shows authenticated state", () =>
    Effect.gen(function* () {
      const { service } = yield* makeTestAuthService
      yield* service.loginWithToken("tok")
      yield* run(["status"]).pipe(
        Effect.provideService(AuthService, service)
      )
      const output = yield* TestConsole.logLines
      const text = output.map(String).join("\n")
      assert.isTrue(text.includes("user@example.com"))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("logout clears auth", () =>
    Effect.gen(function* () {
      const { service, isLoggedIn } = yield* makeTestAuthService
      yield* service.loginWithToken("tok")
      yield* run(["logout"]).pipe(
        Effect.provideService(AuthService, service)
      )
      assert.isFalse(yield* isLoggedIn)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("login fails with AuthError for invalid token", () =>
    Effect.gen(function* () {
      const service = AuthService.of({
        loginWithToken: () => Effect.fail(CliError.AuthError({ message: "Invalid API token" })),
        status: () => Effect.die("unused"),
        logout: () => Effect.die("unused"),
      })
      const result = yield* run(["login", "--token", "bad-token"]).pipe(
        Effect.provideService(AuthService, service),
        Effect.exit
      )
      assert.isTrue(result._tag === "Failure")
    }).pipe(Effect.provide(TestLayer))
  )
})
