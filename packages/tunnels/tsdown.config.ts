import { defineConfig } from "tsdown"

/**
 * Build configuration for the tunnels SDK package.
 */
export default defineConfig({
  entry: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/test-helpers.ts"],
  format: "esm",
  platform: "node",
  target: "node18",
  fixedExtension: false,
  unbundle: true,
  root: "src",
  dts: true,
  clean: true,
  sourcemap: true,
  deps: {
    skipNodeModulesBundle: true,
  },
})
