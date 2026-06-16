import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

/**
 * Unit test configuration for the tunnels CLI package.
 */
export default defineConfig({
  resolve: {
    alias: {
      "tunnels/effect": fileURLToPath(new URL("../tunnels/src/effect/index.ts", import.meta.url)),
      "tunnels/bin": fileURLToPath(new URL("../tunnels/src/bin/index.ts", import.meta.url)),
      tunnels: fileURLToPath(new URL("../tunnels/src/index.ts", import.meta.url)),
    },
  },
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
  },
})
