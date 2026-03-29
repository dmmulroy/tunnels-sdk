import { TunnelConfig } from "tunnel-sdk"

// --- Missing catch-all with autoFallback disabled ---

const result = TunnelConfig.safeParse({
  autoFallback: false,
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
  ],
})

if (!result.success) {
  console.error("Config validation failed:")
  console.error(result.error.format())
  // Ingress rules must end with a catch-all rule (no hostname).
  // Add { service: "http_status:404" } as the last rule,
  // or set autoFallback: true.
}

// --- Auto-fallback appends catch-all (default behavior) ---

const config = TunnelConfig.parse({
  ingress: [
    { hostname: "app.example.com", service: "http://localhost:3000" },
  ],
})
// autoFallback defaults to true — catch-all is auto-appended.
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

// --- Detect typos in keys (strict mode rejects unknown keys) ---

try {
  TunnelConfig.parse({
    ingress: [
      {
        hostname: "app.example.com",
        service: "http://localhost:3000",
        originRequest: {
          connetTimeout: "30s", // typo!
        },
      },
      { service: "http_status:404" },
    ],
  })
} catch (err) {
  console.error(err)
  // ZodError: Unrecognized key(s) in object: 'connetTimeout'
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
