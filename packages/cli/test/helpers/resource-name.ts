import { randomBytes } from "node:crypto"

/**
 * Generate a unique, recognizable resource name for test isolation.
 *
 * Pattern: tunnels-test-{type}-{random}
 *
 * The `tunnels-test-` prefix lets the cleanup script find and delete
 * orphaned resources without affecting real tunnels.
 */
export function resourceName(type: string = "tunnel"): string {
  const rand = randomBytes(4).toString("hex")
  return `tunnels-test-${type}-${rand}`
}
