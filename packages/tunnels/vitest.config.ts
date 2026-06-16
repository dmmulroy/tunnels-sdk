import { defineConfig } from "vitest/config"

/**
 * Unit test configuration for the tunnels SDK package.
 */
export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
  },
})
