import { Effect, Schema, ServiceMap } from "effect"

/**
 * Error raised by Cloudflare authentication providers.
 */
export class AuthError extends Schema.TaggedErrorClass<AuthError>()(
  "AuthError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

/**
 * Auth token set shared by Effect services and async adapters.
 */
export class AuthTokenSet extends Schema.Class<AuthTokenSet>("AuthTokenSet")({
  accessToken: Schema.NonEmptyString,
  refreshToken: Schema.optional(Schema.NonEmptyString),
  expiresAt: Schema.optional(Schema.Number),
  scopes: Schema.optional(Schema.Array(Schema.String)),
}) {}

/**
 * Effect service for Cloudflare authentication.
 */
export class CloudflareAuth extends ServiceMap.Service<
  CloudflareAuth,
  {
    getAccessToken(options?: {
      minTTLMillis?: number
    }): Effect.Effect<string, AuthError>

    refresh(): Effect.Effect<AuthTokenSet, AuthError>

    revoke(): Effect.Effect<void, AuthError>
  }
>()("tunnels/CloudflareAuth") {}

export type CloudflareAuthService = ServiceMap.Service.Shape<typeof CloudflareAuth>

/**
 * Effect-first auth provider for static Cloudflare API tokens.
 */
export const makeApiTokenAuth = (token: string) =>
  CloudflareAuth.of({
    getAccessToken: () => Effect.succeed(token),
    refresh: () =>
      Effect.succeed(
        new AuthTokenSet({
          accessToken: token,
        }),
      ),
    revoke: () => Effect.void,
  })
