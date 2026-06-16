import { defineConfig } from "tsdown"

/**
 * Build configuration for the tunnels CLI package.
 */
export default defineConfig({
  entry: {
    "bin/tunnels": "bin/tunnels.ts",
  },
  format: "esm",
  platform: "node",
  target: "node18",
  fixedExtension: false,
  dts: false,
  clean: true,
  sourcemap: true,
  deps: {
    neverBundle: ["tunnels", "tunnels/effect", /^tunnels\//],
    skipNodeModulesBundle: true,
  },
})
