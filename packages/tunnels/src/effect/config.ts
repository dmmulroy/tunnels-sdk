import { readFile } from "node:fs/promises"
import { Effect, Schema } from "effect"
import { parse as parseYaml } from "yaml"
import { ConfigValidationError } from "./errors.js"

// ---------------------------------------------------------------------------
// Validation primitives
// ---------------------------------------------------------------------------

const DurationString = Schema.String.check(
  Schema.isPattern(
    /^(\d+(\.\d+)?)\s*(ns|us|µs|ms|s|m|h)$/,
    { message: 'Must be a duration string (e.g., "30s", "5m", "1h")' },
  ),
)

const validSchemes = ["http://", "https://", "tcp://", "ssh://", "rdp://", "unix:", "http_status:"]

const ServiceUrl = Schema.String.check(
  Schema.makeFilter((value: string) =>
    validSchemes.some((scheme) => value.startsWith(scheme))
      ? undefined
      : `Service URL must start with one of: ${validSchemes.join(", ")}`,
  ),
)

const Hostname = Schema.String.check(
  Schema.isPattern(
    /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    { message: "Must be a valid hostname (e.g., app.example.com or *.example.com)" },
  ),
)

const CidrNetwork = Schema.String.check(
  Schema.isPattern(
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/,
    { message: "Must be a valid CIDR (e.g., 10.0.0.0/8)" },
  ),
)

// ---------------------------------------------------------------------------
// Origin request config (strict — unknown keys rejected)
// ---------------------------------------------------------------------------

const OriginRequestSchema = Schema.Struct({
  connectTimeout: Schema.optional(DurationString),
  tlsTimeout: Schema.optional(DurationString),
  tcpKeepAlive: Schema.optional(DurationString),
  noHappyEyeballs: Schema.optional(Schema.Boolean),
  keepAliveConnections: Schema.optional(Schema.Number),
  keepAliveTimeout: Schema.optional(DurationString),
  httpHostHeader: Schema.optional(Schema.String),
  originServerName: Schema.optional(Schema.String),
  noTLSVerify: Schema.optional(Schema.Boolean),
  disableChunkedEncoding: Schema.optional(Schema.Boolean),
  proxyAddress: Schema.optional(Schema.String),
  proxyPort: Schema.optional(Schema.Number),
  proxyType: Schema.optional(Schema.String),
})

// ---------------------------------------------------------------------------
// Ingress rule schema
// ---------------------------------------------------------------------------

const IngressRuleSchema = Schema.Struct({
  hostname: Schema.optional(Hostname),
  service: ServiceUrl,
  path: Schema.optional(Schema.String),
  originRequest: Schema.optional(OriginRequestSchema),
})

// ---------------------------------------------------------------------------
// Route schema
// ---------------------------------------------------------------------------

const RouteSchema = Schema.Struct({
  network: CidrNetwork,
  vnet: Schema.optional(Schema.String),
  comment: Schema.optional(Schema.String),
})

// ---------------------------------------------------------------------------
// Full tunnel config schema (base, before custom validation)
// ---------------------------------------------------------------------------

const TunnelConfigBaseSchema = Schema.Struct({
  tunnel: Schema.optional(Schema.String),
  ingress: Schema.Array(IngressRuleSchema),
  autoFallback: Schema.optional(Schema.Boolean),
  dns: Schema.optional(
    Schema.Struct({
      auto: Schema.optional(Schema.Boolean),
      cleanup: Schema.optional(Schema.Boolean),
      overwrite: Schema.optional(Schema.Boolean),
    }),
  ),
  routes: Schema.optional(Schema.Array(RouteSchema)),
  warpRouting: Schema.optional(
    Schema.Struct({
      enabled: Schema.optional(Schema.Boolean),
    }),
  ),
  originRequest: Schema.optional(OriginRequestSchema),
})

type TunnelConfigBase = typeof TunnelConfigBaseSchema.Type

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

/**
 * Normalized tunnel configuration returned after validation.
 */
export interface TunnelConfigOutput extends TunnelConfigBase {
  readonly autoFallback: boolean
}

// ---------------------------------------------------------------------------
// Effectful parse with custom validations
// ---------------------------------------------------------------------------

/**
 * Parses and validates an unknown tunnel configuration object.
 *
 * @param input Raw configuration value to decode and normalize.
 * @returns An Effect that succeeds with normalized config or fails with `ConfigValidationError`.
 */
export const parseConfig = Effect.fn("TunnelConfig.parse")(
  function* (input: unknown): Effect.fn.Return<TunnelConfigOutput, ConfigValidationError> {
    // Step 1: Decode through Schema (with strict originRequest)
    const decoded = yield* Schema.decodeUnknownEffect(TunnelConfigBaseSchema)(input, {
      onExcessProperty: "error",
    }).pipe(
      Effect.mapError((issue) =>
        new ConfigValidationError({
          message: `Invalid tunnel config: ${issue.toString()}`,
          issues: [{ path: [], message: issue.toString() }],
        }),
      ),
    )

    const autoFallback = decoded.autoFallback ?? true

    // Step 2: Validate non-empty ingress
    if (decoded.ingress.length === 0) {
      return yield* new ConfigValidationError({
        message: "Ingress rules must have at least one rule",
        issues: [{ path: ["ingress"], message: "Ingress rules must have at least one rule" }],
      })
    }

    // Step 3: Check for duplicate hostnames
    const seen = new Map<string, number>()
    for (let i = 0; i < decoded.ingress.length; i++) {
      const hostname = decoded.ingress[i].hostname
      if (hostname !== undefined) {
        const previousIndex = seen.get(hostname)
        if (previousIndex !== undefined) {
          return yield* new ConfigValidationError({
            message: `Duplicate hostname "${hostname}" in ingress rules at index ${previousIndex} and ${i}. Each hostname must appear at most once.`,
            issues: [{
              path: ["ingress", i, "hostname"],
              message: `Duplicate hostname "${hostname}" in ingress rules at index ${previousIndex} and ${i}. Each hostname must appear at most once.`,
            }],
          })
        }
        seen.set(hostname, i)
      }
    }

    // Step 4: Check catch-all / auto-fallback
    const ingress = [...decoded.ingress]
    const lastRule = ingress[ingress.length - 1]

    if (lastRule?.hostname !== undefined && !autoFallback) {
      return yield* new ConfigValidationError({
        message:
          'Ingress rules must end with a catch-all rule (no hostname). Add { service: "http_status:404" } as the last rule, or set autoFallback: true.',
        issues: [{
          path: ["ingress"],
          message:
            'Ingress rules must end with a catch-all rule (no hostname). Add { service: "http_status:404" } as the last rule, or set autoFallback: true.',
        }],
      })
    }

    // Step 5: Auto-append catch-all if needed
    if (lastRule?.hostname !== undefined && autoFallback) {
      ingress.push({ service: "http_status:404" })
    }

    return { ...decoded, ingress, autoFallback } as TunnelConfigOutput
  },
)

// ---------------------------------------------------------------------------
// YAML helpers
// ---------------------------------------------------------------------------

/**
 * Parses and validates tunnel configuration from a YAML string.
 *
 * @param yamlString YAML document containing tunnel configuration.
 * @returns An Effect that succeeds with normalized config or fails with `ConfigValidationError`.
 */
export const parseConfigFromYaml = Effect.fn("TunnelConfig.fromYaml")(
  function* (yamlString: string): Effect.fn.Return<TunnelConfigOutput, ConfigValidationError> {
    let parsed: unknown
    try {
      parsed = parseYaml(yamlString)
    } catch (cause) {
      return yield* new ConfigValidationError({
        message: `Invalid YAML: ${cause instanceof Error ? cause.message : String(cause)}`,
        issues: [{ path: [], message: "Failed to parse YAML" }],
      })
    }
    return yield* parseConfig(parsed)
  },
)

/**
 * Reads, parses, and validates tunnel configuration from a YAML file.
 *
 * @param path Filesystem path to the YAML configuration file.
 * @returns An Effect that succeeds with normalized config or fails with `ConfigValidationError`.
 */
export const parseConfigFromFile = Effect.fn("TunnelConfig.fromFile")(
  function* (path: string): Effect.fn.Return<TunnelConfigOutput, ConfigValidationError> {
    const content = yield* Effect.tryPromise({
      try: () => readFile(path, "utf-8"),
      catch: (cause) =>
        new ConfigValidationError({
          message: `Failed to read config file: ${path}`,
          issues: [{ path: [], message: `Failed to read file: ${cause instanceof Error ? cause.message : String(cause)}` }],
        }),
    })
    return yield* parseConfigFromYaml(content)
  },
)
