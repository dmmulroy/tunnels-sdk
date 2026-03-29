import { readFile } from "node:fs/promises"
import { parse as parseYaml } from "yaml"
import { z } from "zod"

const durationString = z
  .string()
  .regex(/^(\d+(\.\d+)?)\s*(ns|us|µs|ms|s|m|h)$/, 'Must be a duration string (e.g., "30s", "5m", "1h")')

const validSchemes = ["http://", "https://", "tcp://", "ssh://", "rdp://", "unix:", "http_status:"]

const serviceUrl = z.string().refine(
  (value) => validSchemes.some((scheme) => value.startsWith(scheme)),
  { message: `Service URL must start with one of: ${validSchemes.join(", ")}` },
)

const hostname = z
  .string()
  .regex(
    /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    "Must be a valid hostname (e.g., app.example.com or *.example.com)",
  )

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

const ingressRuleSchema = z.object({
  hostname: hostname.optional(),
  service: serviceUrl,
  path: z.string().optional(),
  originRequest: originRequestSchema.optional(),
})

const routeSchema = z.object({
  network: z
    .string()
    .regex(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/, "Must be a valid CIDR (e.g., 10.0.0.0/8)"),
  vnet: z.string().optional(),
  comment: z.string().optional(),
})

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

const tunnelConfigSchema = tunnelConfigBaseSchema.superRefine((data, ctx) => {
  const hostnames = data.ingress
    .map((rule, index) => ({ hostname: rule.hostname, index }))
    .filter((rule) => rule.hostname !== undefined)

  const seen = new Map<string, number>()
  for (const { hostname: value, index } of hostnames) {
    const previousIndex = seen.get(value!)
    if (previousIndex !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate hostname "${value}" in ingress rules at index ${previousIndex} and ${index}. Each hostname must appear at most once.`,
        path: ["ingress", index, "hostname"],
      })
    } else {
      seen.set(value!, index)
    }
  }

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

const tunnelConfigTransformed = tunnelConfigSchema.transform((data) => {
  const ingress = [...data.ingress]
  const lastRule = ingress[ingress.length - 1]

  if (lastRule?.hostname !== undefined && data.autoFallback) {
    ingress.push({ service: "http_status:404" })
  }

  return { ...data, ingress }
})

type TunnelConfigInput = z.input<typeof tunnelConfigBaseSchema>
type TunnelConfigOutput = z.output<typeof tunnelConfigTransformed>

export const TunnelConfig = {
  parse(input: TunnelConfigInput): TunnelConfigOutput {
    return tunnelConfigTransformed.parse(input)
  },

  safeParse(input: TunnelConfigInput) {
    return tunnelConfigTransformed.safeParse(input)
  },

  async fromFile(filePath: string): Promise<TunnelConfigOutput> {
    const content = await readFile(filePath, "utf-8")
    return tunnelConfigTransformed.parse(parseYaml(content))
  },

  fromYaml(yamlString: string): TunnelConfigOutput {
    return tunnelConfigTransformed.parse(parseYaml(yamlString))
  },

  schema: tunnelConfigTransformed,
}

export type { TunnelConfigInput, TunnelConfigOutput }
