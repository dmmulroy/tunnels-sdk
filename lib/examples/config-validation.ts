import { parseConfig, parseConfigFromYaml, parseConfigFromFile } from "tunnels"

// --- Validate a config object ---

try {
  const result = parseConfig({
    ingress: [
      { hostname: "app.example.com", service: "http://localhost:3000" },
      { service: "http_status:404" },
    ],
  })
  console.log("Config is valid!")
  console.log("Ingress rules:", result.ingress)
} catch (error) {
  console.error("Validation failed:", error)
}

// --- Parse from YAML string ---

try {
  const yamlResult = parseConfigFromYaml(`
ingress:
  - hostname: app.example.com
    service: http://localhost:3000
  - service: http_status:404
`)
  console.log("YAML config parsed successfully")
  console.log(`${yamlResult.ingress.length} ingress rules`)
} catch (error) {
  console.error("Failed to parse YAML:", error)
}

// --- Parse from a YAML file (async) ---

try {
  const fileResult = await parseConfigFromFile("./tunnels.yaml")
  console.log(`Loaded config with ${fileResult.ingress.length} ingress rules`)
} catch (error) {
  console.error("Failed to load config file:", error)
}

// --- Config validation catches issues like: ---
// - Missing catch-all rule
// - Duplicate hostnames
// - Invalid originRequest keys (typos in connectTimeout, etc.)
// - Invalid CIDR ranges in routes
// - Invalid service URLs
