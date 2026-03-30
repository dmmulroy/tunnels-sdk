import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Run serially — these hit real APIs and share account resources
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    globalSetup: [path.resolve(__dirname, "test/helpers/validate-environment.ts")],
    reporters: ["verbose"],
  },
})
