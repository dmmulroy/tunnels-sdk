import { defineConfig } from "vitest/config"
import path from "node:path"

/**
 * End-to-end test configuration for the tunnels SDK package.
 */
export default defineConfig({
  test: {
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    globalSetup: [path.resolve(__dirname, "test/helpers/validate-environment.ts")],
    reporters: ["verbose"],
  },
})
