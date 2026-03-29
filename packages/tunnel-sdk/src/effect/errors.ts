import { Option, Schema } from "effect"

export class TunnelSdkError extends Schema.TaggedErrorClass<TunnelSdkError>()(
  "TunnelSdkError",
  { message: Schema.String, cause: Schema.optional(Schema.Defect) }
) {}

export class TunnelApiError extends Schema.TaggedErrorClass<TunnelApiError>()(
  "TunnelApiError",
  {
    status: Schema.Number,
    errors: Schema.Array(
      Schema.Struct({ code: Schema.Number, message: Schema.String })
    ),
  }
) {}

export class TunnelAuthError extends Schema.TaggedErrorClass<TunnelAuthError>()(
  "TunnelAuthError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(() =>
        Option.some("Authentication failed. Check your API token and account ID.")
      )
    ),
  }
) {}

export class TunnelNotFoundError extends Schema.TaggedErrorClass<TunnelNotFoundError>()(
  "TunnelNotFoundError",
  { tunnelRef: Schema.String }
) {}

export class TunnelProcessError extends Schema.TaggedErrorClass<TunnelProcessError>()(
  "TunnelProcessError",
  {
    message: Schema.String,
    exitCode: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Defect),
  }
) {}

export class BinaryInstallError extends Schema.TaggedErrorClass<BinaryInstallError>()(
  "BinaryInstallError",
  { message: Schema.String, cause: Schema.optional(Schema.Defect) }
) {}

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
