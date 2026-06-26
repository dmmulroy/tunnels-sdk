import { Option, Schema } from "effect"

/**
 * Generic SDK error for validation and orchestration failures.
 */
export class TunnelSdkError extends Schema.TaggedErrorClass<TunnelSdkError>()(
  "TunnelSdkError",
  { message: Schema.String, cause: Schema.optional(Schema.Defect) }
) {}

/**
 * Cloudflare API error response with status and error details.
 */
export class TunnelApiError extends Schema.TaggedErrorClass<TunnelApiError>()(
  "TunnelApiError",
  {
    status: Schema.Number,
    errors: Schema.Array(
      Schema.Struct({ code: Schema.Number, message: Schema.String })
    ),
  }
) {}

/**
 * Authentication or authorization failure from Cloudflare.
 */
export class TunnelAuthError extends Schema.TaggedErrorClass<TunnelAuthError>()(
  "TunnelAuthError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(() =>
        Option.some(
          "Cloudflare authentication failed.\nhelp: check CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and token permissions.",
        )
      )
    ),
  }
) {}

/**
 * Error raised when a tunnel name or ID cannot be found.
 */
export class TunnelNotFoundError extends Schema.TaggedErrorClass<TunnelNotFoundError>()(
  "TunnelNotFoundError",
  { tunnelRef: Schema.String }
) {}

/**
 * Runtime error emitted while starting or supervising cloudflared.
 */
export class TunnelProcessError extends Schema.TaggedErrorClass<TunnelProcessError>()(
  "TunnelProcessError",
  {
    message: Schema.String,
    exitCode: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Defect),
  }
) {}

/**
 * Error raised while locating, downloading, or installing cloudflared.
 */
export class BinaryInstallError extends Schema.TaggedErrorClass<BinaryInstallError>()(
  "BinaryInstallError",
  { message: Schema.String, cause: Schema.optional(Schema.Defect) }
) {}

/**
 * Error raised when tunnel configuration fails schema or semantic validation.
 */
export class ConfigValidationError extends Schema.TaggedErrorClass<ConfigValidationError>()(
  "ConfigValidationError",
  {
    message: Schema.String,
    issues: Schema.Array(
      Schema.Struct({
        path: Schema.Array(Schema.Union([Schema.String, Schema.Number])),
        message: Schema.String,
      })
    ),
  }
) {}
