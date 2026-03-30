import { Effect, Exit } from "effect"
import { parseConfig, parseConfigFromYaml, parseConfigFromFile } from "tunnels"

// --- Validate a config object ---

const result = Effect.runSyncExit(
  parseConfig({
    ingress: [
      { hostname: "app.example.com", service: "http://localhost:3000" },
      { service: "http_status:404" },
    ],
  }),
)

if (Exit.isSuccess(result)) {
  console.log("Config is valid!")
  console.log("Ingress rules:", result.value.ingress)
} else {
  console.error("Validation failed:", result.cause)
}

// --- Parse from YAML string ---

const yamlResult = Effect.runSyncExit(
  parseConfigFromYaml(`
ingress:
  - hostname: app.example.com
    service: http://localhost:3000
  - service: http_status:404
`),
)

if (Exit.isSuccess(yamlResult)) {
  console.log("YAML config parsed successfully")
  console.log(`${yamlResult.value.ingress.length} ingress rules`)
}

// --- Parse from a YAML file (async) ---

const fileResult = await Effect.runPromiseExit(
  parseConfigFromFile("./tunnels.yaml"),
)

if (Exit.isSuccess(fileResult)) {
  console.log(`Loaded config with ${fileResult.value.ingress.length} ingress rules`)
} else {
  console.error("Failed to load config file")
}

// --- Config validation catches issues like: ---
// - Missing catch-all rule
// - Duplicate hostnames
// - Invalid originRequest keys (typos in connectTimeout, etc.)
// - Invalid CIDR ranges in warp-routing
// - Invalid service URLs
