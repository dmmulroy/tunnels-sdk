import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { AuthService } from "../services.js"

const login = Command.make("login", {
  token: Flag.string("token").pipe(
    Flag.withDescription("API token for headless/CI auth")
  ),
}, (config) =>
  Effect.gen(function* () {
    const svc = yield* AuthService
    yield* svc.loginWithToken(config.token)
    yield* Console.log("✓ Authenticated")
  })
).pipe(Command.withDescription("Authenticate with Cloudflare"))

const status = Command.make("status", {}, () =>
  Effect.gen(function* () {
    const svc = yield* AuthService
    const s = yield* svc.status()
    if (s.authenticated) {
      yield* Console.log(`✓ Authenticated as ${s.email}`)
    } else {
      yield* Console.log("✗ Not authenticated")
    }
  })
).pipe(Command.withDescription("Check authentication status"))

const logout = Command.make("logout", {}, () =>
  Effect.gen(function* () {
    const svc = yield* AuthService
    yield* svc.logout()
    yield* Console.log("✓ Logged out")
  })
).pipe(Command.withDescription("Log out"))

export const auth = Command.make("auth").pipe(
  Command.withDescription("Authentication management"),
  Command.withSubcommands([login, status, logout])
)
