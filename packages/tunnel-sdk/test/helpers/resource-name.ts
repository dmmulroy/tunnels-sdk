import { randomBytes } from "node:crypto"

/**
 * Generate a unique, recognizable resource name for test isolation.
 *
 * Pattern: cft-test-{type}-{random}
 *
 * The `cft-test-` prefix lets the cleanup script find and delete
 * orphaned resources without affecting real tunnels.
 */
export function resourceName(type: string = "tunnel"): string {
  const rand = randomBytes(4).toString("hex")
  return `cft-test-${type}-${rand}`
}
