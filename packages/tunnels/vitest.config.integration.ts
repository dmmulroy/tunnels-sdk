import { defineConfig } from "vitest/config"
import path from "node:path"

/**
 * Integration test configuration for the tunnels SDK package.
 */
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run serially — these hit real APIs and share account resources
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    globalSetup: [path.resolve(__dirname, "test/helpers/validate-environment.ts")],
    reporters: ["verbose"],
  },
})
