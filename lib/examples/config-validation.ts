/**
 * Config Validation — catch mistakes at build time, not deploy time.
 *
 * Demonstrates Zod-powered config validation with actionable errors.
 * Use in tests, CI, or pre-deploy hooks.
 */

import { TunnelConfig } from "tunnel-sdk"

// --- Validate an object ---

const result = TunnelConfig.safeParse({
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
    // Missing catch-all rule!
  ],
})

if (!result.success) {
  console.error("Config validation failed:")
  console.error(result.error.format())
  // Ingress rules must end with a catch-all rule.
  // Add { service: "http_status:404" } as the last rule,
  // or set `autoFallback: true`.
}

// --- Validate with auto-fallback ---

const config = TunnelConfig.parse({
  autoFallback: true,  // auto-add catch-all
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
  ],
})
// Works! catch-all is auto-appended.
console.log(config.ingress)
// [
//   { hostname: "app.example.com", service: "http://localhost:3000" },
//   { service: "http_status:404" }
// ]

// --- Load from YAML file ---

const fileConfig = await TunnelConfig.fromFile("./cft.yaml")
console.log(`Loaded config with ${fileConfig.ingress.length} ingress rules`)

// --- Load from YAML string ---

const yamlConfig = TunnelConfig.fromYaml(`
  ingress:
    - hostname: app.example.com
      service: http://localhost:3000
    - service: http_status:404
`)

// --- Detect typos in keys ---

try {
  TunnelConfig.parse({
    ingress: [
      {
        hostname: "app.example.com",
        service: "http://localhost:3000",
        originRequest: {
          connetTimeout: "30s",  // typo!
        },
      },
      { service: "http_status:404" },
    ],
  })
} catch (err) {
  console.error(err)
  // ZodError: Unrecognized key "connetTimeout" in originRequest.
  // Did you mean "connectTimeout"?
}

// --- Detect duplicate hostnames ---

try {
  TunnelConfig.parse({
    ingress: [
      { hostname: "app.example.com", service: "http://localhost:3000" },
      { hostname: "app.example.com", service: "http://localhost:3001" }, // duplicate!
      { service: "http_status:404" },
    ],
  })
} catch (err) {
  console.error(err)
  // ZodError: Duplicate hostname "app.example.com" in ingress rules
  // at index 0 and 1. Each hostname must appear at most once.
}
