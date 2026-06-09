import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "tunnels/effect": fileURLToPath(new URL("../tunnels/src/effect/index.ts", import.meta.url)),
      "tunnels/bin": fileURLToPath(new URL("../tunnels/src/bin/index.ts", import.meta.url)),
      tunnels: fileURLToPath(new URL("../tunnels/src/index.ts", import.meta.url)),
    },
  },
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
