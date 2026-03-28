import { z } from "zod"
import { readFile } from "node:fs/promises"

// ── Duration string validation ──────────────────────────────────────────────

const durationString = z
  .string()
  .regex(
    /^\d+(\.\d+)?\s*(ns|us|µs|ms|s|m|h)$/,
    'Must be a duration string (e.g., "30s", "5m", "1h")',
  )

// ── Service URL validation ──────────────────────────────────────────────────

const validSchemes = ["http://", "https://", "tcp://", "ssh://", "rdp://", "unix:", "http_status:"]

const serviceUrl = z.string().refine(
  (val) => validSchemes.some((scheme) => val.startsWith(scheme)),
  {
    message: `Service URL must start with one of: ${validSchemes.join(", ")}`,
  },
)

// ── Hostname validation ─────────────────────────────────────────────────────

const hostname = z
  .string()
  .regex(
    /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    "Must be a valid hostname (e.g., app.example.com or *.example.com)",
  )

// ── Origin Request Config ───────────────────────────────────────────────────

const originRequestSchema = z
  .object({
    connectTimeout: durationString.optional(),
    tlsTimeout: durationString.optional(),
    tcpKeepAlive: durationString.optional(),
    noHappyEyeballs: z.boolean().optional(),
    keepAliveConnections: z.number().int().positive().optional(),
    keepAliveTimeout: durationString.optional(),
    httpHostHeader: z.string().optional(),
    originServerName: z.string().optional(),
    noTLSVerify: z.boolean().optional(),
    disableChunkedEncoding: z.boolean().optional(),
    proxyAddress: z.string().optional(),
    proxyPort: z.number().int().min(1).max(65535).optional(),
    proxyType: z.string().optional(),
  })
  .strict()

// ── Ingress Rule ────────────────────────────────────────────────────────────

const ingressRuleSchema = z.object({
  hostname: hostname.optional(),
  service: serviceUrl,
  path: z.string().optional(),
  originRequest: originRequestSchema.optional(),
})

// ── Route ───────────────────────────────────────────────────────────────────

const routeSchema = z.object({
  network: z
    .string()
    .regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/, "Must be a valid CIDR (e.g., 10.0.0.0/8)"),
  vnet: z.string().optional(),
  comment: z.string().optional(),
})

// ── Full Tunnel Config ──────────────────────────────────────────────────────

const tunnelConfigBaseSchema = z.object({
  tunnel: z.string().optional(),
  ingress: z.array(ingressRuleSchema).min(1, "Ingress rules must have at least one rule"),
  autoFallback: z.boolean().optional().default(true),
  dns: z
    .object({
      auto: z.boolean().optional(),
      cleanup: z.boolean().optional(),
    })
    .optional(),
  routes: z.array(routeSchema).optional(),
  warpRouting: z
    .object({
      enabled: z.boolean().optional(),
    })
    .optional(),
  originRequest: originRequestSchema.optional(),
})

// ── Post-processing (catch-all, duplicate detection) ────────────────────────

const tunnelConfigSchema = tunnelConfigBaseSchema.superRefine((data, ctx) => {
  // Check for duplicate hostnames
  const hostnames = data.ingress
    .map((r, i) => ({ hostname: r.hostname, index: i }))
    .filter((r) => r.hostname !== undefined)

  const seen = new Map<string, number>()
  for (const { hostname: h, index } of hostnames) {
    const prev = seen.get(h!)
    if (prev !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate hostname "${h}" in ingress rules at index ${prev} and ${index}. Each hostname must appear at most once.`,
        path: ["ingress", index, "hostname"],
      })
    } else {
      seen.set(h!, index)
    }
  }

  // Check catch-all rule
  const lastRule = data.ingress[data.ingress.length - 1]
  if (lastRule?.hostname !== undefined && !data.autoFallback) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'Ingress rules must end with a catch-all rule (no hostname). Add { service: "http_status:404" } as the last rule, or set autoFallback: true.',
      path: ["ingress"],
    })
  }
})

// ── Transform (auto-append catch-all) ───────────────────────────────────────

const tunnelConfigTransformed = tunnelConfigSchema.transform((data) => {
  const ingress = [...data.ingress]

  // Auto-append catch-all if needed
  const lastRule = ingress[ingress.length - 1]
  if (lastRule?.hostname !== undefined && data.autoFallback) {
    ingress.push({ service: "http_status:404" })
  }

  return { ...data, ingress }
})

// ── Public API ──────────────────────────────────────────────────────────────

type TunnelConfigInput = z.input<typeof tunnelConfigBaseSchema>
type TunnelConfigOutput = z.output<typeof tunnelConfigTransformed>

/** Zod-powered config validation for Cloudflare Tunnels */
export const TunnelConfig = {
  /** Parse and validate a config object. Throws on invalid. */
  parse(input: TunnelConfigInput): TunnelConfigOutput {
    return tunnelConfigTransformed.parse(input)
  },

  /** Parse and validate, returning a result object instead of throwing. */
  safeParse(input: TunnelConfigInput) {
    return tunnelConfigTransformed.safeParse(input)
  },

  /** Load and validate a config from a YAML file. */
  async fromFile(filePath: string): Promise<TunnelConfigOutput> {
    const { parse: parseYaml } = await import("yaml")
    const content = await readFile(filePath, "utf-8")
    const data = parseYaml(content)
    return tunnelConfigTransformed.parse(data)
  },

  /** Parse and validate a YAML string. */
  fromYaml(yamlString: string): TunnelConfigOutput {
    // Dynamic import workaround — yaml is a sync parse
    // We'll use require-style inline here since yaml is a dep
    let parseYaml: (s: string) => unknown
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      parseYaml = require("yaml").parse
    } catch {
      throw new Error("yaml package is required for fromYaml(). Install with: npm install yaml")
    }
    const data = parseYaml(yamlString)
    return tunnelConfigTransformed.parse(data)
  },

  /** The underlying Zod schema (for advanced use) */
  schema: tunnelConfigTransformed,
}

export type { TunnelConfigInput, TunnelConfigOutput }
